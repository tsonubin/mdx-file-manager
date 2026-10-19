import * as vscode from "vscode";
import { ConnectionCheckMode, ExtensionSettings, InsertRule, Profile, ProviderType } from "./types";
import { ensureLeadingDot } from "./utils";

const CONFIG_NS = "mdxAssetManager";

const KNOWN_PROVIDERS: Record<ProviderType, true> = {
  "aws-s3": true,
  "cloudflare-r2": true,
  "custom-s3": true
};

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
  const rawMaxSizeMB = Number(config.get<unknown>("maxUploadSizeMB", 100));
  return {
    profiles: normalizeProfiles(config.get<unknown>("profiles", [])),
    defaultProfile: config.get<string>("defaultProfile"),
    workspaceDefaultProfile: config.get<string>("workspaceDefaultProfile"),
    allowedExtensions: normalizeExtensions(config.get<unknown>("allowedExtensions", DEFAULT_ALLOWED_EXTENSIONS)),
    // A malformed size must not disable the limit (NaN comparisons are false).
    maxUploadSizeMB: Number.isFinite(rawMaxSizeMB) ? Math.max(1, rawMaxSizeMB) : 100,
    insertRules: normalizeInsertRules(config.get<unknown>("insertRules", [])),
    // Unknown values coerce to the current default behavior.
    connectionCheck: config.get<ConnectionCheckMode>("connectionCheck", "write-probe") === "read-only" ? "read-only" : "write-probe",
    promptForWorkspaceDefault: config.get<boolean>("promptForWorkspaceDefault", true) !== false
  };
}

export async function savePromptForWorkspaceDefault(enabled: boolean): Promise<void> {
  await getConfig().update("promptForWorkspaceDefault", enabled, vscode.ConfigurationTarget.Global);
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
  if (!KNOWN_PROVIDERS[profile.provider]) {
    errors.push("Profile provider must be one of aws-s3, cloudflare-r2, custom-s3.");
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

function normalizeProfiles(raw: unknown): Profile[] {
  const profiles = Array.isArray(raw) ? raw : [];
  const seen = new Set<string>();
  const normalized: Profile[] = [];

  for (const entry of profiles) {
    if (!entry || typeof entry !== "object") {
      continue;
    }
    // Unvalidated settings JSON; every field is guarded below.
    const profile = entry as Partial<Profile>;
    const id = trimmedString(profile.id);
    if (!id || seen.has(id)) {
      continue;
    }
    seen.add(id);
    normalized.push({
      ...profile,
      id,
      name: trimmedString(profile.name) || id,
      // Settings may carry a typo'd provider; validateProfile rejects unknown
      // values, so the raw value travels through unfiltered.
      provider: profile.provider as ProviderType,
      bucket: trimmedString(profile.bucket),
      region: trimmedString(profile.region) || undefined,
      endpoint: trimmedString(profile.endpoint) || undefined,
      accountId: trimmedString(profile.accountId) || undefined,
      publicBaseUrl: trimmedString(profile.publicBaseUrl),
      basePrefix: trimmedString(profile.basePrefix) || "assets",
      forcePathStyle: profile.forcePathStyle ?? false
    });
  }

  return normalized;
}

function normalizeExtensions(raw: unknown): string[] {
  const values = strings(raw);
  const effective = values.length ? values : DEFAULT_ALLOWED_EXTENSIONS;
  return [...new Set(effective.map((ext) => ensureLeadingDot(ext).toLowerCase()).filter(Boolean))];
}

function normalizeInsertRules(raw: unknown): InsertRule[] {
  const rules = Array.isArray(raw) ? raw : [];
  const normalized: InsertRule[] = [];

  for (const entry of rules) {
    if (!entry || typeof entry !== "object") {
      continue;
    }
    // Unvalidated settings JSON; every field is guarded below.
    const rule = entry as InsertRule;
    const languageIds = strings(rule.when?.languageIds).map((id) => id.trim().toLowerCase()).filter(Boolean);
    if (typeof rule.template !== "string" || !languageIds.length) {
      continue;
    }
    normalized.push({
      when: {
        languageIds,
        extensions: strings(rule.when?.extensions).map((ext) => ensureLeadingDot(ext)).filter(Boolean),
        mimePrefixes: strings(rule.when?.mimePrefixes).map((value) => value.trim().toLowerCase()).filter(Boolean)
      },
      template: rule.template
    });
  }

  return normalized;
}

// Unvalidated settings arrays can hold non-strings; settings fields can hold
// non-strings. Both normalizers rely on these for lockstep filtering.
function strings(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function trimmedString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}
