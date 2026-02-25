import * as assert from "node:assert";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as vscode from "vscode";
import { suite, test } from "mocha";
import { MdxDocumentDropProvider } from "../../drop/documentDropProvider";
import type { UploadResult } from "../../types";

suite("Document Drop Provider", () => {
  test("builds a drop edit from text/uri-list payload", async () => {
    const droppedFile = await createTempFile("sample-image.png", "fake");
    const document = await vscode.workspace.openTextDocument({ language: "markdown", content: "" });

    const captured: { filePaths?: string[]; document?: vscode.TextDocument } = {};
    const mockResult: UploadResult[] = [
      {
        key: "assets/content/post/sample-image.png",
        url: "https://cdn.example.com/assets/content/post/sample-image.png",
        snippet: "![sample image](https://cdn.example.com/assets/content/post/sample-image.png)"
      }
    ];

    const provider = new MdxDocumentDropProvider({
      async uploadFiles(options: { filePaths: string[]; targetDocument: vscode.TextDocument }): Promise<UploadResult[]> {
        captured.filePaths = options.filePaths;
        captured.document = options.targetDocument;
        return mockResult;
      }
    } as any);

    const dataTransfer = new vscode.DataTransfer();
    dataTransfer.set("text/uri-list", new vscode.DataTransferItem(vscode.Uri.file(droppedFile).toString()));

    const edit = await provider.provideDocumentDropEdits(
      document,
      new vscode.Position(0, 0),
      dataTransfer,
      new vscode.CancellationTokenSource().token
    );

    assert.ok(edit, "Expected a document drop edit");
    assert.deepEqual(captured.filePaths, [droppedFile]);
    assert.equal(captured.document, document);
    assert.ok(edit?.insertText instanceof vscode.SnippetString);
    assert.equal((edit?.insertText as vscode.SnippetString).value, mockResult[0].snippet);
  });

  test("returns undefined when no file payload exists", async () => {
    const provider = new MdxDocumentDropProvider({
      async uploadFiles(): Promise<UploadResult[]> {
        throw new Error("Should not be called");
      }
    } as any);

    const document = await vscode.workspace.openTextDocument({ language: "markdown", content: "" });
    const emptyDataTransfer = new vscode.DataTransfer();

    const edit = await provider.provideDocumentDropEdits(
      document,
      new vscode.Position(0, 0),
      emptyDataTransfer,
      new vscode.CancellationTokenSource().token
    );

    assert.equal(edit, undefined);
  });
});

async function createTempFile(name: string, contents: string): Promise<string> {
  const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  if (!root) {
    throw new Error("No workspace folder available for integration tests");
  }

  const targetDir = path.join(root, ".tmp-test-assets");
  await fs.mkdir(targetDir, { recursive: true });

  const filePath = path.join(targetDir, name);
  await fs.writeFile(filePath, contents, "utf8");
  return filePath;
}
