import * as assert from "node:assert";
import * as fs from "node:fs/promises";
import * as http from "node:http";
import type { AddressInfo } from "node:net";
import * as path from "node:path";
import * as vscode from "vscode";
import { suite, test } from "mocha";
import { AssetService } from "../../assetService";
import { AssetTreeDataProvider } from "../../assets/treeDataProvider";
import { ProfileResolver } from "../../profile/resolver";
import { saveDefaultProfile, saveProfiles, saveWorkspaceDefaultProfile } from "../../config";
import { SecretStore } from "../../secrets";
import { AssetRecord, Profile } from "../../types";

const EXTENSION_ID = "shay.mdx-asset-manager";

const profiles: Profile[] = [
  {
    id: "aws-a",
    name: "AWS A",
    provider: "aws-s3",
    bucket: "bucket-a",
    region: "us-east-1",
    publicBaseUrl: "https://cdn-a.example.com",
    basePrefix: "assets"
  },
  {
    id: "r2-b",
    name: "R2 B",
    provider: "cloudflare-r2",
    bucket: "bucket-b",
    accountId: "account-123",
    publicBaseUrl: "https://cdn-b.example.com",
    basePrefix: "assets"
  }
];

suite("Extension Host Integration", () => {
  test("activates extension and registers core commands", async () => {
    const ext = vscode.extensions.getExtension(EXTENSION_ID);
    assert.ok(ext, `Extension '${EXTENSION_ID}' must be available`);

    await ext!.activate();

    const commands = await vscode.commands.getCommands(true);
    for (const command of [
      "mdxAssetManager.addProfile",
      "mdxAssetManager.editProfile",
      "mdxAssetManager.removeProfile",
      "mdxAssetManager.setWorkspaceDefaultProfile",
      "mdxAssetManager.switchActiveProfile",
      "mdxAssetManager.setProfileCredentials",
      "mdxAssetManager.clearProfileCredentials",
      "mdxAssetManager.uploadFromFilePicker",
      "mdxAssetManager.refreshAssets",
      "mdxAssetManager.copyAssetUrl",
      "mdxAssetManager.copyAssetSnippet",
      "mdxAssetManager.deleteAsset"
    ]) {
      assert.ok(commands.includes(command), `Missing command registration: ${command}`);
    }
  });

  test("resolves workspace default before user default", async () => {
    const file = await createWorkspaceFile("profile-resolution.md", "# test");
    const document = await vscode.workspace.openTextDocument(file);

    await saveProfiles(profiles);
    await saveDefaultProfile("aws-a");
    await saveWorkspaceDefaultProfile("r2-b", document.uri);

    const resolver = new ProfileResolver();
    const resolved = await resolver.resolveProfile({
      resource: document.uri,
      interactive: false,
      askToSetWorkspaceDefault: false
    });

    assert.ok(resolved);
    assert.equal(resolved?.profile.id, "r2-b");
    assert.equal(resolved?.source, "workspaceDefault");

    await clearProfileConfig(document.uri);
  });

  test("session profile override wins over defaults", async () => {
    const file = await createWorkspaceFile("session-resolution.md", "# test");
    const document = await vscode.workspace.openTextDocument(file);

    await saveProfiles(profiles);
    await saveDefaultProfile("aws-a");
    await saveWorkspaceDefaultProfile("r2-b", document.uri);

    const resolver = new ProfileResolver();
    resolver.setSessionProfile("aws-a");

    const resolved = await resolver.resolveProfile({
      resource: document.uri,
      interactive: false,
      askToSetWorkspaceDefault: false
    });

    assert.ok(resolved);
    assert.equal(resolved?.profile.id, "aws-a");
    assert.equal(resolved?.source, "session");

    await clearProfileConfig(document.uri);
  });

  test("keeps successful uploads when other files fail", async () => {
    // Stub S3 endpoint: PUT succeeds, HEAD reports the key as free.
    const server = http.createServer((request, response) => {
      request.resume();
      response.writeHead(request.method === "PUT" ? 200 : 404);
      response.end();
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    assert.ok(address && typeof address !== "string", "stub server must report a port");
    const { port } = address;

    const target = await createWorkspaceFile("batch-target.md", "# target");
    const document = await vscode.workspace.openTextDocument(target);
    const root = path.dirname(target.fsPath);
    const goodA = path.join(root, "batch-a.png");
    const goodB = path.join(root, "batch-b.png");
    const folder = path.join(root, "folder.png");
    await fs.writeFile(goodA, "fake");
    await fs.writeFile(goodB, "fake");
    await fs.mkdir(folder, { recursive: true });

    try {
      await saveProfiles([
        {
          id: "stub-s3",
          name: "Stub S3",
          provider: "custom-s3",
          bucket: "bucket",
          endpoint: `http://127.0.0.1:${port}`,
          publicBaseUrl: "https://cdn.example.com",
          forcePathStyle: true
        }
      ]);
      await saveDefaultProfile("stub-s3");

      // Credential stub: the real SecretStore needs the extension context.
      const assetService = new AssetService(new ProfileResolver(), {
        getProfileCredentials: async () => ({ accessKeyId: "stub", secretAccessKey: "stub" })
      } as unknown as SecretStore);

      const result = await assetService.uploadFiles({
        filePaths: [goodA, folder, goodB],
        targetDocument: document,
        allowProfilePrompt: false
      });

      assert.equal(result.uploaded.length, 2);
      assert.deepEqual(
        result.failures.map((failure) => failure.file),
        ["folder.png"]
      );
    } finally {
      server.close();
      await clearProfileConfig(document.uri);
    }
  });

  test("discards stale asset listings", async () => {
    const pendingListings: Array<(assets: AssetRecord[]) => void> = [];
    const assetService = {
      listAssetsForActiveDocument: () => new Promise<AssetRecord[]>((resolve) => pendingListings.push(resolve))
      // Stub implements only the listing method the provider calls.
    } as unknown as AssetService;
    const provider = new AssetTreeDataProvider(assetService);

    // Stub editors: refresh only reads document.languageId/fileName.
    const firstEditor = { document: { languageId: "markdown", fileName: "first.md" } } as vscode.TextEditor;
    const secondEditor = { document: { languageId: "markdown", fileName: "second.md" } } as vscode.TextEditor;

    const first = provider.refresh(firstEditor);
    const second = provider.refresh(secondEditor);

    pendingListings[1]([{ profileId: "p", profileName: "Stub", key: "fresh.png", url: "https://cdn.example.com/fresh.png" }]);
    await second;
    pendingListings[0]([
      { profileId: "p", profileName: "Stub", key: "stale-a.png", url: "https://cdn.example.com/stale-a.png" },
      { profileId: "p", profileName: "Stub", key: "stale-b.png", url: "https://cdn.example.com/stale-b.png" }
    ]);
    await first;

    assert.equal(provider.getStatusMessage(), "Stub • 1 asset");
    const items = provider.getChildren();
    assert.ok(Array.isArray(items));
    assert.equal(items[0].asset.key, "fresh.png");
  });
});

async function createWorkspaceFile(fileName: string, content: string): Promise<vscode.Uri> {
  const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  if (!root) {
    throw new Error("No workspace folder available for integration tests");
  }

  const filePath = path.join(root, fileName);
  await fs.writeFile(filePath, content, "utf8");
  return vscode.Uri.file(filePath);
}

async function clearProfileConfig(resource: vscode.Uri): Promise<void> {
  await saveProfiles([]);
  await saveDefaultProfile(undefined);
  await saveWorkspaceDefaultProfile(undefined, resource);
}
