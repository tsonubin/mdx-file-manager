import * as path from "node:path";
import * as vscode from "vscode";
import { AssetService } from "../assetService";

export class MdxDocumentDropProvider implements vscode.DocumentDropEditProvider {
  constructor(private readonly assetService: AssetService, private readonly onUploaded?: () => void) {}

  async provideDocumentDropEdits(
    document: vscode.TextDocument,
    _position: vscode.Position,
    dataTransfer: vscode.DataTransfer,
    _token: vscode.CancellationToken
  ): Promise<vscode.DocumentDropEdit | undefined> {
    const filePaths = await getDroppedFilePaths(dataTransfer);
    if (!filePaths.length) {
      return undefined;
    }

    try {
      const uploaded = await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: "Uploading dropped assets"
        },
        () => this.assetService.uploadFiles({ filePaths, targetDocument: document })
      );

      if (!uploaded.length) {
        return undefined;
      }

      const snippetText = uploaded.map((item) => item.snippet).join("\n");
      this.onUploaded?.();

      return new vscode.DocumentDropEdit(new vscode.SnippetString(snippetText));
    } catch (error) {
      void vscode.window.showErrorMessage(`Upload failed: ${toMessage(error)}`);
      return undefined;
    }
  }
}

async function getDroppedFilePaths(dataTransfer: vscode.DataTransfer): Promise<string[]> {
  const filePaths: string[] = [];

  for (const [, item] of dataTransfer) {
    const file = item.asFile();
    if (file?.uri?.scheme === "file") {
      filePaths.push(file.uri.fsPath);
    }
  }

  const uriListItem = dataTransfer.get("text/uri-list");
  if (uriListItem) {
    const value = await uriListItem.asString();
    for (const rawLine of value.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line || line.startsWith("#")) {
        continue;
      }
      try {
        const uri = vscode.Uri.parse(line);
        if (uri.scheme === "file") {
          filePaths.push(uri.fsPath);
        }
      } catch {
        if (path.isAbsolute(line)) {
          filePaths.push(line);
        }
      }
    }
  }

  return [...new Set(filePaths)];
}

function toMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}
