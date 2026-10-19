import * as path from "node:path";
import * as vscode from "vscode";
import { AssetService } from "../assetService";
import { AssetRecord } from "../types";
import { formatBytes, isSupportedDocument } from "../utils";

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

export class AssetTreeDataProvider implements vscode.TreeDataProvider<AssetTreeItem> {
  private readonly onDidChangeTreeDataEmitter = new vscode.EventEmitter<AssetTreeItem | void>();
  readonly onDidChangeTreeData = this.onDidChangeTreeDataEmitter.event;

  private assets: AssetRecord[] = [];
  private statusMessage = "Open an MDX/Markdown/HTML file to view assets.";
  private refreshGeneration = 0;

  constructor(private readonly assetService: AssetService) {}

  getStatusMessage(): string {
    return this.statusMessage;
  }

  async refresh(editor = vscode.window.activeTextEditor): Promise<void> {
    const generation = ++this.refreshGeneration;

    if (!editor || !isSupportedDocument(editor.document)) {
      this.assets = [];
      this.statusMessage = "Open an MDX/Markdown/HTML file to view scoped assets.";
      this.onDidChangeTreeDataEmitter.fire();
      return;
    }

    try {
      const assets = await this.assetService.listAssetsForActiveDocument(editor);
      if (generation !== this.refreshGeneration) {
        return;
      }
      this.assets = assets;
      const profileName = assets[0]?.profileName;
      const countText = assets.length === 1 ? "1 asset" : `${assets.length} assets`;
      this.statusMessage = profileName ? `${profileName} • ${countText}` : countText;
    } catch (error) {
      if (generation !== this.refreshGeneration) {
        return;
      }
      // Keep the last known items; a transient listing failure should only
      // change the status line, not blank the view.
      this.statusMessage = `Failed to load assets: ${toMessage(error)}`;
    }

    this.onDidChangeTreeDataEmitter.fire();
  }

  getTreeItem(element: AssetTreeItem): vscode.TreeItem {
    return element;
  }

  getChildren(): vscode.ProviderResult<AssetTreeItem[]> {
    return this.assets.map((asset) => new AssetTreeItem(asset));
  }
}

function toMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}
