import * as vscode from "vscode";
import { AssetService } from "./assetService";
import { AssetTreeDataProvider } from "./assets/treeDataProvider";
import { registerAssetCommands } from "./commands";
import { MdxDocumentDropProvider } from "./drop/documentDropProvider";
import { registerProfileCommands } from "./profile/commands";
import { ProfileResolver } from "./profile/resolver";
import { SecretStore } from "./secrets";

export function activate(context: vscode.ExtensionContext): void {
  const secretStore = new SecretStore(context);
  const profileResolver = new ProfileResolver();
  const assetService = new AssetService(profileResolver, secretStore);

  const treeProvider = new AssetTreeDataProvider(assetService);
  const treeView = vscode.window.createTreeView("mdxAssetsView", {
    treeDataProvider: treeProvider,
    showCollapseAll: false
  });

  const refreshViewMessage = (): void => {
    treeView.message = treeProvider.getStatusMessage();
  };

  registerProfileCommands(context, { secretStore, profileResolver });
  registerAssetCommands(context, { assetService, treeProvider, onTreeRefreshed: refreshViewMessage });

  const dropProvider = new MdxDocumentDropProvider(assetService, () => {
    void treeProvider.refresh();
    refreshViewMessage();
  });

  context.subscriptions.push(
    treeView,
    vscode.languages.registerDocumentDropEditProvider(
      [
        { language: "markdown" },
        { language: "mdx" },
        { language: "html" }
      ],
      dropProvider
    ),
    vscode.window.onDidChangeActiveTextEditor(async (editor) => {
      await treeProvider.refresh(editor);
      refreshViewMessage();
    }),
    vscode.workspace.onDidChangeConfiguration(async (event) => {
      if (event.affectsConfiguration("mdxAssetManager")) {
        await treeProvider.refresh();
        refreshViewMessage();
      }
    })
  );

  void treeProvider.refresh().then(refreshViewMessage);
}

export function deactivate(): void {
  // No-op.
}
