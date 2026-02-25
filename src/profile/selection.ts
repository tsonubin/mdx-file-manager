import { Profile } from "../types";

export interface ProfileResolutionInput {
  profiles: Profile[];
  sessionProfileId?: string;
  workspaceDefaultProfile?: string;
  defaultProfile?: string;
}

export interface ProfileResolutionResult {
  profile?: Profile;
  source?: "session" | "workspaceDefault" | "userDefault" | "single";
}

export function resolveProfileFromDefaults(input: ProfileResolutionInput): ProfileResolutionResult {
  const byId = new Map(input.profiles.map((profile) => [profile.id, profile]));

  if (input.sessionProfileId) {
    const profile = byId.get(input.sessionProfileId);
    if (profile) {
      return { profile, source: "session" };
    }
  }

  if (input.workspaceDefaultProfile) {
    const profile = byId.get(input.workspaceDefaultProfile);
    if (profile) {
      return { profile, source: "workspaceDefault" };
    }
  }

  if (input.defaultProfile) {
    const profile = byId.get(input.defaultProfile);
    if (profile) {
      return { profile, source: "userDefault" };
    }
  }

  if (input.profiles.length === 1) {
    return { profile: input.profiles[0], source: "single" };
  }

  return {};
}
