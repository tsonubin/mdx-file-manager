import * as vscode from "vscode";
import { AssetService } from "./assetService";
import { AssetTreeDataProvider } from "./assets/treeDataProvider";
import { registerAssetCommands } from "./commands";
import { warnAboutSettingsProblems } from "./config";
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

  // Editor switches can arrive in bursts; coalesce refreshes so a tab-flip
  // through N docs costs one listing round trip, not N.
  let refreshTimer: NodeJS.Timeout | undefined;
  const scheduleTreeRefresh = (): void => {
    clearTimeout(refreshTimer);
    refreshTimer = setTimeout(() => {
      void treeProvider.refresh().then(refreshViewMessage);
    }, 200);
  };

  registerProfileCommands(context, { secretStore, profileResolver });
  registerAssetCommands(context, { assetService, treeProvider, onTreeRefreshed: refreshViewMessage });

  const dropProvider = new MdxDocumentDropProvider(assetService, () => {
    void treeProvider.refresh();
    refreshViewMessage();
  });

  context.subscriptions.push(
    treeView,
    treeProvider,
    vscode.languages.registerDocumentDropEditProvider(
      [
        { language: "markdown" },
        { language: "mdx" },
        { language: "html" }
      ],
      dropProvider
    ),
    vscode.window.onDidChangeActiveTextEditor(scheduleTreeRefresh),
    vscode.workspace.onDidChangeConfiguration((event) => {
      if (event.affectsConfiguration("mdxAssetManager")) {
        warnAboutSettingsProblems();
        scheduleTreeRefresh();
      }
    }),
    new vscode.Disposable(() => clearTimeout(refreshTimer))
  );

  warnAboutSettingsProblems();
  void treeProvider.refresh().then(refreshViewMessage);
}

export function deactivate(): void {
  // No-op.
}
