import * as path from "node:path";
import * as vscode from "vscode";
import { AssetService } from "../assetService";
import { AssetRecord } from "../types";
import { describeError, formatBytes, isSupportedDocument } from "../utils";

export class AssetTreeItem extends vscode.TreeItem {
  constructor(public readonly asset: AssetRecord) {
    super(path.basename(asset.key), vscode.TreeItemCollapsibleState.None);
    this.contextValue = "mdxAssetItem";
    this.description = formatBytes(asset.size);
    this.tooltip = `${asset.url}${asset.lastModified ? `\n${asset.lastModified.toLocaleString()}` : ""}`;
    this.command = {
      command: "mdxAssetManager.copyAssetUrl",
      title: "Copy Asset URL",
      arguments: [asset]
    };
  }
}

export class AssetTreeDataProvider implements vscode.TreeDataProvider<AssetTreeItem>, vscode.Disposable {
  private readonly onDidChangeTreeDataEmitter = new vscode.EventEmitter<AssetTreeItem | void>();
  readonly onDidChangeTreeData = this.onDidChangeTreeDataEmitter.event;

  private assets: AssetRecord[] = [];
  private statusMessage = "Open an MDX/Markdown/HTML file to view assets.";
  private refreshGeneration = 0;
  private refreshCancellation?: AbortController;

  constructor(private readonly assetService: AssetService) {}

  getStatusMessage(): string {
    return this.statusMessage;
  }

  async refresh(editor = vscode.window.activeTextEditor): Promise<void> {
    const generation = ++this.refreshGeneration;
    this.refreshCancellation?.abort();
    const cancellation = new AbortController();
    this.refreshCancellation = cancellation;

    if (!editor || !isSupportedDocument(editor.document)) {
      this.refreshCancellation = undefined;
      this.assets = [];
      this.statusMessage = "Open an MDX/Markdown/HTML file to view scoped assets.";
      this.onDidChangeTreeDataEmitter.fire();
      return;
    }

    try {
      const listing = await this.assetService.listAssetsForActiveDocument(editor, cancellation.signal);
      if (generation !== this.refreshGeneration) {
        return;
      }

      if (!listing) {
        this.assets = [];
        this.statusMessage = "Open an MDX/Markdown/HTML file to view scoped assets.";
      } else if (listing.kind === "listed") {
        this.assets = listing.assets;
        const countText = listing.assets.length === 1 ? "1 asset" : `${listing.assets.length} assets`;
        this.statusMessage = `${listing.profileName} • ${countText}`;
      } else {
        this.assets = [];
        if (listing.kind === "no-profiles") {
          this.statusMessage = "No endpoint profiles configured. Run 'Mdx Assets: Add Endpoint Profile'.";
        } else if (listing.kind === "no-default-profile") {
          this.statusMessage = "No upload profile selected. Set a default or run 'Mdx Assets: Switch Active Profile'.";
        } else {
          this.statusMessage = `No credentials for '${listing.profileName}'. Run 'Mdx Assets: Set Profile Credentials'.`;
        }
      }
    } catch (error) {
      if (generation !== this.refreshGeneration || cancellation.signal.aborted) {
        return;
      }
      // A failed refresh may target a different document or profile. Never
      // leave stale, actionable assets under the new scope.
      this.assets = [];
      this.statusMessage = `Failed to load assets: ${describeError(error)}`;
    } finally {
      if (generation === this.refreshGeneration && this.refreshCancellation === cancellation) {
        this.refreshCancellation = undefined;
      }
    }

    this.onDidChangeTreeDataEmitter.fire();
  }

  getTreeItem(element: AssetTreeItem): vscode.TreeItem {
    return element;
  }

  getChildren(): vscode.ProviderResult<AssetTreeItem[]> {
    return this.assets.map((asset) => new AssetTreeItem(asset));
  }

  dispose(): void {
    this.refreshCancellation?.abort();
    this.refreshCancellation = undefined;
    this.onDidChangeTreeDataEmitter.dispose();
  }

}
