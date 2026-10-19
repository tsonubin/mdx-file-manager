import * as vscode from "vscode";
import { AssetService } from "./assetService";
import { AssetTreeDataProvider, AssetTreeItem } from "./assets/treeDataProvider";
import { getSettings } from "./config";
import { buildInsertSnippet, createInsertContext } from "./insert/patternEngine";
import { AssetRecord } from "./types";
import { describeError } from "./utils";

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
        void vscode.window.showErrorMessage(`Uploaded, but inserting snippets failed: ${describeError(error)}`);
      }
    }),

    vscode.commands.registerCommand("mdxAssetManager.refreshAssets", async () => {
      await treeProvider.refresh();
      onTreeRefreshed?.();
    }),

    vscode.commands.registerCommand("mdxAssetManager.copyAssetUrl", async (item?: AssetTreeItem | AssetRecord) => {
      const asset = toAssetRecord(item);
      if (!asset) {
        return;
      }
      await vscode.env.clipboard.writeText(asset.url);
      void vscode.window.showInformationMessage("Copied asset URL.");
    }),

    vscode.commands.registerCommand("mdxAssetManager.copyAssetSnippet", async (item?: AssetTreeItem | AssetRecord) => {
      const asset = toAssetRecord(item);
      if (!asset) {
        return;
      }

      const editor = vscode.window.activeTextEditor;
      const languageId = editor?.document.languageId ?? "markdown";
      const filename = asset.key.split("/").pop() || asset.key;

      const settings = getSettings(editor?.document.uri);
      const snippet = buildInsertSnippet(
        createInsertContext({
          languageId,
          filename,
          url: asset.url,
          key: asset.key
        }),
        settings.insertRules
      );

      await vscode.env.clipboard.writeText(snippet);
      void vscode.window.showInformationMessage("Copied asset snippet.");
    }),

    vscode.commands.registerCommand("mdxAssetManager.deleteAsset", async (item?: AssetTreeItem | AssetRecord) => {
      const asset = toAssetRecord(item);
      if (!asset) {
        return;
      }

      const confirm = await vscode.window.showWarningMessage(
        `Delete '${asset.key}' from remote storage?`,
        { modal: true },
        "Delete"
      );
      if (confirm !== "Delete") {
        return;
      }

      try {
        await assetService.deleteAsset(asset);
        await treeProvider.refresh();
        onTreeRefreshed?.();
        void vscode.window.showInformationMessage("Asset deleted.");
      } catch (error) {
        void vscode.window.showErrorMessage(`Delete failed: ${describeError(error)}`);
      }
    })
  );
}

// Context menus pass the tree item; the tree item's click command passes the
// underlying record. Normalize both shapes here.
function toAssetRecord(item?: AssetTreeItem | AssetRecord): AssetRecord | undefined {
  if (!item) {
    return undefined;
  }
  return item instanceof AssetTreeItem ? item.asset : item;
}
