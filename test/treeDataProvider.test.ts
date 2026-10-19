import { describe, expect, it, vi } from "vitest";
import type * as vscode from "vscode";
import { AssetTreeDataProvider } from "../src/assets/treeDataProvider";
import { AssetService } from "../src/assetService";
import { AssetListing } from "../src/types";

vi.mock("vscode", () => {
  class EventEmitter {
    listeners: Array<() => void> = [];
    event = (listener: () => void) => {
      this.listeners.push(listener);
      return { dispose: () => undefined };
    };
    fire() {
      for (const listener of this.listeners) {
        listener();
      }
    }
    dispose() {}
  }
  class TreeItem {
    constructor(
      public label?: unknown,
      public collapsibleState?: unknown
    ) {}
  }
  return { EventEmitter, TreeItem, TreeItemCollapsibleState: { None: 0 } };
});

describe("AssetTreeDataProvider status", () => {
  it("names the cause when the view is empty", async () => {
    const outcomes: Array<AssetListing | undefined> = [
      { kind: "no-profiles" },
      { kind: "no-default-profile" },
      { kind: "no-credentials", profileName: "Prod R2" },
      { kind: "listed", profileName: "Prod R2", assets: [] }
    ];
    const assetService = {
      listAssetsForActiveDocument: async () => outcomes.shift()
      // Stub implements only the listing method the provider calls.
    } as unknown as AssetService;
    const provider = new AssetTreeDataProvider(assetService);

    // Stub editor: refresh only reads document.languageId/fileName.
    const editor = { document: { languageId: "markdown", fileName: "post.md" } } as vscode.TextEditor;

    await provider.refresh(editor);
    expect(provider.getStatusMessage()).toBe("No endpoint profiles configured. Run 'Mdx Assets: Add Endpoint Profile'.");

    await provider.refresh(editor);
    expect(provider.getStatusMessage()).toBe("No upload profile selected. Set a default or run 'Mdx Assets: Switch Active Profile'.");
    expect(provider.getChildren()).toEqual([]);

    await provider.refresh(editor);
    expect(provider.getStatusMessage()).toBe("No credentials for 'Prod R2'. Run 'Mdx Assets: Set Profile Credentials'.");

    await provider.refresh(editor);
    expect(provider.getStatusMessage()).toBe("Prod R2 • 0 assets");
  });
});
