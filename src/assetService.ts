import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as vscode from "vscode";
import { lookup as mimeLookup } from "mime-types";
import { getSettings, validateProfile } from "./config";
import { buildInsertSnippet, createInsertContext } from "./insert/patternEngine";
import { ProfileResolver } from "./profile/resolver";
import { SecretStore } from "./secrets";
import { ActiveDocScope, AssetRecord, Profile, UploadBatchResult, UploadFailure, UploadResult } from "./types";
import { isSupportedDocument, relativePathOrBasename, stripExtension } from "./utils";
import { buildObjectKey, buildScopePrefix, shortUniqueSuffix } from "./upload/keyBuilder";
import { S3Uploader } from "./upload/s3Uploader";

export class AssetService {
  constructor(private readonly profileResolver: ProfileResolver, private readonly secretStore: SecretStore) {}

  getActiveScope(editor = vscode.window.activeTextEditor): ActiveDocScope | undefined {
    if (!editor) {
      return undefined;
    }

    const document = editor.document;
    if (!isSupportedDocument(document)) {
      return undefined;
    }

    const workspaceFolder = vscode.workspace.getWorkspaceFolder(document.uri);
    const relativePath = relativePathOrBasename(document, workspaceFolder);
    const fileBaseName = stripExtension(path.basename(relativePath));
    const relativeDir = path.posix.dirname(relativePath);

    return {
      document,
      workspaceFolder,
      relativePath,
      relativeDir,
      fileBaseName,
      keyPrefix: ""
    };
  }

  async uploadFiles(options: {
    filePaths: string[];
    targetDocument: vscode.TextDocument;
    allowProfilePrompt?: boolean;
    token?: vscode.CancellationToken;
  }): Promise<UploadBatchResult> {
    const { filePaths, targetDocument, token } = options;
    const settings = getSettings(targetDocument.uri);

    const resolved = await this.profileResolver.resolveProfile({
      resource: targetDocument.uri,
      interactive: options.allowProfilePrompt ?? true,
      askToSetWorkspaceDefault: true
    });

    if (!resolved) {
      return { uploaded: [], failures: [] };
    }

    const validationErrors = validateProfile(resolved.profile);
    if (validationErrors.length) {
      void vscode.window.showErrorMessage(validationErrors.join(" "));
      return { uploaded: [], failures: [] };
    }

    const credentials = await this.secretStore.getProfileCredentials(resolved.profile.id);
    if (!credentials) {
      const setNow = await vscode.window.showWarningMessage(
        `Missing credentials for profile '${resolved.profile.name}'.`,
        "Set Credentials",
        "Cancel"
      );
      if (setNow === "Set Credentials") {
        await vscode.commands.executeCommand("mdxAssetManager.setProfileCredentials", resolved.profile.id);
      }
      return { uploaded: [], failures: [] };
    }

    const uploader = new S3Uploader(resolved.profile, credentials);
    const workspaceFolder = vscode.workspace.getWorkspaceFolder(targetDocument.uri);
    const scope = this.scopeFromDocument(targetDocument, resolved.profile, workspaceFolder);

    const uploaded: UploadResult[] = [];
    const failures: UploadFailure[] = [];
    const renames: string[] = [];
    for (const filePath of filePaths) {
      if (token?.isCancellationRequested) {
        break;
      }

      const file = path.basename(filePath);
      try {
        const stat = await fs.stat(filePath);
        if (!stat.isFile()) {
          failures.push({ file, reason: "not a regular file" });
          continue;
        }

        const ext = path.extname(filePath).toLowerCase();
        const maxBytes = settings.maxUploadSizeMB * 1024 * 1024;

        if (stat.size > maxBytes) {
          failures.push({ file, reason: `exceeds ${settings.maxUploadSizeMB}MB` });
          continue;
        }

        if (settings.allowedExtensions.length && !settings.allowedExtensions.includes(ext)) {
          failures.push({ file, reason: `extension ${ext || "(none)"} is not allowed` });
          continue;
        }

        const { key, fallback } = await this.ensureUniqueKey(uploader, scope.keyPrefix, filePath);
        const url = await uploader.uploadFile(filePath, key);
        const context = createInsertContext({
          languageId: targetDocument.languageId,
          filename: path.basename(filePath),
          url,
          key,
          mime: (mimeLookup(filePath) || "application/octet-stream").toString()
        });

        uploaded.push({
          key,
          url,
          snippet: buildInsertSnippet(context, settings.insertRules)
        });
        if (fallback) {
          renames.push(`${file} → ${key.split("/").pop() ?? key}`);
        }
      } catch (error) {
        failures.push({ file, reason: error instanceof Error ? error.message : String(error) });
      }
    }

    if (failures.length) {
      void vscode.window.showWarningMessage(summarizeUploadFailures(failures));
    }
    if (renames.length) {
      void vscode.window.showInformationMessage(
        `Uploaded under a new name to keep existing assets intact: ${renames.join("; ")}. Nothing is overwritten — remove old versions from the MDX Assets view when they are no longer used.`
      );
    }

    return { uploaded, failures };
  }

  async listAssetsForActiveDocument(editor = vscode.window.activeTextEditor): Promise<AssetRecord[]> {
    const scope = this.getActiveScope(editor);
    if (!scope) {
      return [];
    }

    const resolved = await this.profileResolver.resolveProfile({
      resource: scope.document.uri,
      interactive: false,
      askToSetWorkspaceDefault: false
    });
    if (!resolved) {
      return [];
    }

    const credentials = await this.secretStore.getProfileCredentials(resolved.profile.id);
    if (!credentials) {
      return [];
    }

    const uploader = new S3Uploader(resolved.profile, credentials);
    const prefix = buildScopePrefix(scope, resolved.profile);
    const listed = await uploader.listByPrefix(`${prefix}/`);
    return listed.map((item) => uploader.toAssetRecord(item));
  }

  async deleteAsset(asset: AssetRecord): Promise<void> {
    const settings = getSettings();
    const profile = settings.profiles.find((item) => item.id === asset.profileId);
    if (!profile) {
      throw new Error(`Profile '${asset.profileId}' was not found.`);
    }

    const credentials = await this.secretStore.getProfileCredentials(profile.id);
    if (!credentials) {
      throw new Error(`Missing credentials for profile '${profile.name}'.`);
    }

    const uploader = new S3Uploader(profile, credentials);
    await uploader.deleteObject(asset.key);
  }

  private scopeFromDocument(document: vscode.TextDocument, profile: Profile, workspaceFolder?: vscode.WorkspaceFolder): ActiveDocScope {
    const relativePath = relativePathOrBasename(document, workspaceFolder);
    const fileBaseName = stripExtension(path.basename(relativePath));
    const relativeDir = path.posix.dirname(relativePath);
    const keyPrefix = buildScopePrefix({ relativeDir, fileBaseName }, profile);

    return {
      document,
      workspaceFolder,
      relativePath,
      relativeDir,
      fileBaseName,
      keyPrefix
    };
  }

  private async ensureUniqueKey(uploader: S3Uploader, prefix: string, filePath: string): Promise<{ key: string; fallback: boolean }> {
    let attempt = 0;
    while (attempt < 10) {
      const key = buildObjectKey(prefix, filePath, attempt ? shortUniqueSuffix() : undefined);
      const exists = await uploader.keyExists(key);
      if (exists === false) {
        return { key, fallback: attempt > 0 };
      }
      if (exists === "unknown") {
        break;
      }
      attempt += 1;
    }

    // Uniqueness unverifiable or exhausted: fail safe with a unique suffix
    // instead of risking overwriting an existing object.
    return { key: buildObjectKey(prefix, filePath, `${Date.now()}-${shortUniqueSuffix()}`), fallback: true };
  }
}

function summarizeUploadFailures(failures: UploadFailure[]): string {
  const shown = failures.slice(0, 3).map((failure) => `${failure.file} — ${failure.reason}`);
  const remaining = failures.length - shown.length;
  const details = remaining > 0 ? `${shown.join("; ")}; +${remaining} more` : shown.join("; ");
  return `Failed to upload ${failures.length} file(s): ${details}`;
}
