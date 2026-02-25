import * as vscode from "vscode";
import { ExtensionSettings, InsertRule, Profile } from "./types";
import { ensureLeadingDot } from "./utils";

const CONFIG_NS = "mdxAssetManager";

const DEFAULT_ALLOWED_EXTENSIONS = [
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".webp",
  ".svg",
  ".avif",
  ".mp4",
  ".webm",
  ".mov",
  ".pdf"
];

export function getConfig(resource?: vscode.Uri): vscode.WorkspaceConfiguration {
  return vscode.workspace.getConfiguration(CONFIG_NS, resource);
}

export function getSettings(resource?: vscode.Uri): ExtensionSettings {
  const config = getConfig(resource);
  return {
    profiles: normalizeProfiles(config.get<Profile[]>("profiles", [])),
    defaultProfile: config.get<string>("defaultProfile"),
    workspaceDefaultProfile: config.get<string>("workspaceDefaultProfile"),
    allowedExtensions: normalizeExtensions(config.get<string[]>("allowedExtensions", DEFAULT_ALLOWED_EXTENSIONS)),
    maxUploadSizeMB: Math.max(1, config.get<number>("maxUploadSizeMB", 100)),
    insertRules: normalizeInsertRules(config.get<InsertRule[]>("insertRules", []))
  };
}

export async function saveProfiles(profiles: Profile[]): Promise<void> {
  await getConfig().update("profiles", profiles, vscode.ConfigurationTarget.Global);
}

export async function saveDefaultProfile(id: string | undefined): Promise<void> {
  await getConfig().update("defaultProfile", id, vscode.ConfigurationTarget.Global);
}

export async function saveWorkspaceDefaultProfile(id: string | undefined, resource?: vscode.Uri): Promise<void> {
  await getConfig(resource).update("workspaceDefaultProfile", id, vscode.ConfigurationTarget.Workspace);
}

export function validateProfile(profile: Profile): string[] {
  const errors: string[] = [];
  if (!profile.id?.trim()) {
    errors.push("Profile id is required.");
  }
  if (!profile.name?.trim()) {
    errors.push("Profile name is required.");
  }
  if (!profile.bucket?.trim()) {
    errors.push("Bucket is required.");
  }
  if (!profile.publicBaseUrl?.trim()) {
    errors.push("publicBaseUrl is required.");
  }
  if (profile.provider === "custom-s3" && !profile.endpoint?.trim()) {
    errors.push("Custom S3 profile requires endpoint.");
  }
  if (profile.provider === "cloudflare-r2" && !profile.endpoint?.trim() && !profile.accountId?.trim()) {
    errors.push("Cloudflare R2 profile requires endpoint or accountId.");
  }
  if (profile.publicBaseUrl && !/^https?:\/\//i.test(profile.publicBaseUrl)) {
    errors.push("publicBaseUrl must start with http:// or https://");
  }
  return errors;
}

function normalizeProfiles(profiles: Profile[]): Profile[] {
  const seen = new Set<string>();
  const normalized: Profile[] = [];

  for (const profile of profiles) {
    if (!profile || !profile.id) {
      continue;
    }
    const id = profile.id.trim();
    if (!id || seen.has(id)) {
      continue;
    }
    seen.add(id);
    normalized.push({
      ...profile,
      id,
      name: profile.name?.trim() || id,
      provider: profile.provider,
      bucket: profile.bucket?.trim() || "",
      region: profile.region?.trim() || undefined,
      endpoint: profile.endpoint?.trim() || undefined,
      accountId: profile.accountId?.trim() || undefined,
      publicBaseUrl: profile.publicBaseUrl?.trim() || "",
      basePrefix: profile.basePrefix?.trim() || "assets",
      forcePathStyle: profile.forcePathStyle ?? false
    });
  }

  return normalized;
}

function normalizeExtensions(exts: string[]): string[] {
  const values = exts.length ? exts : DEFAULT_ALLOWED_EXTENSIONS;
  return [...new Set(values.map((ext) => ensureLeadingDot(ext).toLowerCase()).filter(Boolean))];
}

function normalizeInsertRules(rules: InsertRule[]): InsertRule[] {
  return rules
    .filter((rule) => rule?.template && rule?.when?.languageIds?.length)
    .map((rule) => ({
      when: {
        languageIds: rule.when.languageIds.map((id) => id.trim().toLowerCase()).filter(Boolean),
        extensions: rule.when.extensions?.map((ext) => ensureLeadingDot(ext)).filter(Boolean),
        mimePrefixes: rule.when.mimePrefixes?.map((value) => value.trim().toLowerCase()).filter(Boolean)
      },
      template: rule.template
    }));
}
