import * as vscode from "vscode";
import { getSettings, saveWorkspaceDefaultProfile } from "../config";
import { ResolvedProfile, Profile } from "../types";
import { resolveProfileFromDefaults } from "./selection";

export class ProfileResolver {
  private sessionProfileId: string | undefined;

  setSessionProfile(id: string | undefined): void {
    this.sessionProfileId = id;
  }

  getSessionProfileId(): string | undefined {
    return this.sessionProfileId;
  }

  async resolveProfile(options?: { resource?: vscode.Uri; interactive?: boolean; askToSetWorkspaceDefault?: boolean }): Promise<ResolvedProfile | undefined> {
    const resource = options?.resource;
    const interactive = options?.interactive ?? true;
    const askToSetWorkspaceDefault = options?.askToSetWorkspaceDefault ?? true;

    const settings = getSettings(resource);
    const profiles = settings.profiles;

    if (!profiles.length) {
      if (interactive) {
        void vscode.window.showWarningMessage("No endpoint profiles configured. Run 'Mdx Assets: Add Endpoint Profile'.");
      }
      return undefined;
    }

    const resolved = resolveProfileFromDefaults({
      profiles,
      sessionProfileId: this.sessionProfileId,
      workspaceDefaultProfile: settings.workspaceDefaultProfile,
      defaultProfile: settings.defaultProfile
    });
    if (resolved.profile && resolved.source) {
      return { profile: resolved.profile, source: resolved.source };
    }

    if (!interactive) {
      return undefined;
    }

    const selected = await this.pickProfile(profiles, "Select upload profile");
    if (!selected) {
      return undefined;
    }

    if (askToSetWorkspaceDefault && resource) {
      const choice = await vscode.window.showInformationMessage(
        `Use '${selected.name}' as workspace default profile?`,
        "Yes",
        "No"
      );
      if (choice === "Yes") {
        await saveWorkspaceDefaultProfile(selected.id, resource);
      }
    }

    return { profile: selected, source: "picked" };
  }

  async pickProfile(profiles: Profile[], placeHolder: string): Promise<Profile | undefined> {
    const picks = profiles.map((profile) => ({
      label: profile.name,
      description: `${profile.id} • ${profile.provider}`,
      detail: `${profile.bucket} • ${profile.publicBaseUrl}`,
      profile
    }));
    const picked = await vscode.window.showQuickPick(picks, { placeHolder });
    return picked?.profile;
  }
}
