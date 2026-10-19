import * as vscode from "vscode";
import { AssetService } from "./assetService";
import { AssetTreeDataProvider, AssetTreeItem } from "./assets/treeDataProvider";
import { getSettings } from "./config";
import { buildInsertSnippet, createInsertContext } from "./insert/patternEngine";

export function registerAssetCommands(context: vscode.ExtensionContext, deps: {
  assetService: AssetService;
  treeProvider: AssetTreeDataProvider;
  onTreeRefreshed?: () => void;
}): void {
  const { assetService, treeProvider, onTreeRefreshed } = deps;

  context.subscriptions.push(
    vscode.commands.registerCommand("mdxAssetManager.uploadFromFilePicker", async () => {
      const activeEditor = vscode.window.activeTextEditor;
      if (!activeEditor) {
        void vscode.window.showWarningMessage("Open an MDX/Markdown/HTML file first.");
        return;
      }

      const picked = await vscode.window.showOpenDialog({
        canSelectMany: true,
        canSelectFiles: true,
        canSelectFolders: false,
        openLabel: "Upload"
      });

      if (!picked?.length) {
        return;
      }

      try {
        const { uploaded } = await vscode.window.withProgress(
          {
            location: vscode.ProgressLocation.Notification,
            title: "Uploading assets"
          },
          (_progress, token) => assetService.uploadFiles({
            filePaths: picked.map((uri) => uri.fsPath),
            targetDocument: activeEditor.document,
            token
          })
        );

        if (!uploaded.length) {
          return;
        }

        await activeEditor.edit((editBuilder) => {
          const insertion = uploaded.map((item) => item.snippet).join("\n");
          const selection = activeEditor.selection;
          editBuilder.insert(selection.active, insertion);
        });

        await treeProvider.refresh(activeEditor);
        onTreeRefreshed?.();
      } catch (error) {
        void vscode.window.showErrorMessage(`Uploaded, but inserting snippets failed: ${toMessage(error)}`);
      }
    }),

    vscode.commands.registerCommand("mdxAssetManager.refreshAssets", async () => {
      await treeProvider.refresh();
      onTreeRefreshed?.();
    }),

    vscode.commands.registerCommand("mdxAssetManager.copyAssetUrl", async (item?: AssetTreeItem | { url?: string }) => {
      const url = extractUrl(item);
      if (!url) {
        return;
      }
      await vscode.env.clipboard.writeText(url);
      void vscode.window.showInformationMessage("Copied asset URL.");
    }),

    vscode.commands.registerCommand("mdxAssetManager.copyAssetSnippet", async (item?: AssetTreeItem) => {
      if (!item) {
        return;
      }

      const editor = vscode.window.activeTextEditor;
      const languageId = editor?.document.languageId ?? "markdown";
      const extension = item.asset.key.includes(".") ? `.${item.asset.key.split(".").pop()?.toLowerCase() ?? ""}` : "";
      const filename = item.asset.key.split("/").pop() || item.asset.key;

      const settings = getSettings(editor?.document.uri);
      const snippet = buildInsertSnippet(
        createInsertContext({
          languageId,
          filename,
          extension,
          url: item.asset.url,
          key: item.asset.key
        }),
        settings.insertRules
      );

      await vscode.env.clipboard.writeText(snippet);
      void vscode.window.showInformationMessage("Copied asset snippet.");
    }),

    vscode.commands.registerCommand("mdxAssetManager.deleteAsset", async (item?: AssetTreeItem) => {
      if (!item) {
        return;
      }

      const confirm = await vscode.window.showWarningMessage(
        `Delete '${item.asset.key}' from remote storage?`,
        { modal: true },
        "Delete"
      );
      if (confirm !== "Delete") {
        return;
      }

      try {
        await assetService.deleteAsset(item.asset);
        await treeProvider.refresh();
        onTreeRefreshed?.();
        void vscode.window.showInformationMessage("Asset deleted.");
      } catch (error) {
        void vscode.window.showErrorMessage(`Delete failed: ${toMessage(error)}`);
      }
    })
  );
}

function extractUrl(item?: AssetTreeItem | { url?: string }): string | undefined {
  if (!item) {
    return undefined;
  }

  if (item instanceof AssetTreeItem) {
    return item.asset.url;
  }

  return item.url;
}

function toMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}
