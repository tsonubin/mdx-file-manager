import * as vscode from "vscode";
import { getSettings, saveDefaultProfile, saveProfiles, saveWorkspaceDefaultProfile, validateProfile } from "../config";
import { SecretStore } from "../secrets";
import { Profile, ProfileCredentials, ProviderType } from "../types";
import { sanitizeSegment } from "../utils";
import { S3Uploader } from "../upload/s3Uploader";
import { ProfileResolver } from "./resolver";

export interface ProfileCommandDeps {
  secretStore: SecretStore;
  profileResolver: ProfileResolver;
}

export function registerProfileCommands(context: vscode.ExtensionContext, deps: ProfileCommandDeps): void {
  const subscriptions: vscode.Disposable[] = [
    vscode.commands.registerCommand("mdxAssetManager.addProfile", () => addProfile(deps.secretStore)),
    vscode.commands.registerCommand("mdxAssetManager.editProfile", () => editProfile(deps.secretStore)),
    vscode.commands.registerCommand("mdxAssetManager.removeProfile", () => removeProfile(deps.secretStore)),
    vscode.commands.registerCommand("mdxAssetManager.setWorkspaceDefaultProfile", () => setWorkspaceDefaultProfile()),
    vscode.commands.registerCommand("mdxAssetManager.switchActiveProfile", () => switchActiveProfile(deps.profileResolver)),
    vscode.commands.registerCommand("mdxAssetManager.setProfileCredentials", (profileId?: string) => setProfileCredentials(deps.secretStore, profileId)),
    vscode.commands.registerCommand("mdxAssetManager.clearProfileCredentials", (profileId?: string) => clearProfileCredentials(deps.secretStore, profileId))
  ];

  context.subscriptions.push(...subscriptions);
}

async function addProfile(secretStore: SecretStore): Promise<void> {
  const provider = await pickProvider();
  if (!provider) {
    return;
  }

  const settings = getSettings();

  const name = await prompt("Profile name", "My media endpoint");
  if (!name) {
    return;
  }

  const idDefault = sanitizeSegment(name);
  const id = await prompt("Profile id", idDefault, (value) => {
    if (!value.trim()) {
      return "Profile id is required.";
    }
    if (settings.profiles.some((profile) => profile.id === value.trim())) {
      return "Profile id already exists.";
    }
    return undefined;
  });
  if (!id) {
    return;
  }

  const profile = await promptProfileFields({
    provider,
    id: id.trim(),
    name: name.trim()
  });
  if (!profile) {
    return;
  }

  const errors = validateProfile(profile);
  if (errors.length) {
    void vscode.window.showErrorMessage(errors.join(" "));
    return;
  }

  const maybeCredentials = await promptForOptionalCredentials();
  if (maybeCredentials && "status" in maybeCredentials && maybeCredentials.status === "cancel") {
    return;
  }

  if (maybeCredentials?.credentials) {
    const valid = await validateProfileConnection(profile, maybeCredentials.credentials);
    if (!valid) {
      const answer = await vscode.window.showWarningMessage(
        "Connection validation failed. Save profile anyway?",
        "Save Anyway",
        "Cancel"
      );
      if (answer !== "Save Anyway") {
        return;
      }
    }
  }

  await saveProfiles([...settings.profiles, profile]);

  if (maybeCredentials?.credentials) {
    await secretStore.setProfileCredentials(profile.id, maybeCredentials.credentials);
  }

  const setGlobalDefault = await vscode.window.showInformationMessage(
    `Set '${profile.name}' as global default profile?`,
    "Yes",
    "No"
  );
  if (setGlobalDefault === "Yes") {
    await saveDefaultProfile(profile.id);
  }

  const activeEditor = vscode.window.activeTextEditor;
  if (activeEditor?.document.uri) {
    const setWorkspaceDefault = await vscode.window.showInformationMessage(
      `Set '${profile.name}' as workspace default profile?`,
      "Yes",
      "No"
    );
    if (setWorkspaceDefault === "Yes") {
      await saveWorkspaceDefaultProfile(profile.id, activeEditor.document.uri);
    }
  }

  void vscode.window.showInformationMessage(`Profile '${profile.name}' created.`);
}

async function editProfile(secretStore: SecretStore): Promise<void> {
  const settings = getSettings();
  if (!settings.profiles.length) {
    void vscode.window.showWarningMessage("No profiles configured.");
    return;
  }

  const original = await pickProfile(settings.profiles, "Select profile to edit");
  if (!original) {
    return;
  }

  const profile = await promptProfileFields({
    ...original
  });
  if (!profile) {
    return;
  }

  const errors = validateProfile(profile);
  if (errors.length) {
    void vscode.window.showErrorMessage(errors.join(" "));
    return;
  }

  const updateCredentials = await vscode.window.showQuickPick(
    [
      { label: "Keep existing credentials", value: "keep" },
      { label: "Update credentials", value: "update" }
    ],
    { placeHolder: "Credentials" }
  );
  if (!updateCredentials) {
    return;
  }

  if (updateCredentials.value === "update") {
    const accessKeyId = await prompt("Access key id", "", (value) => (!value.trim() ? "Access key id is required." : undefined));
    if (!accessKeyId) {
      return;
    }

    const secretAccessKey = await prompt("Secret access key", "", (value) => (!value.trim() ? "Secret access key is required." : undefined), true);
    if (!secretAccessKey) {
      return;
    }

    await secretStore.setProfileCredentials(profile.id, {
      accessKeyId: accessKeyId.trim(),
      secretAccessKey: secretAccessKey.trim()
    });
  }

  const next = settings.profiles.map((item) => (item.id === original.id ? profile : item));
  await saveProfiles(next);
  void vscode.window.showInformationMessage(`Profile '${profile.name}' updated.`);
}

async function removeProfile(secretStore: SecretStore): Promise<void> {
  const settings = getSettings();
  if (!settings.profiles.length) {
    void vscode.window.showWarningMessage("No profiles configured.");
    return;
  }

  const profile = await pickProfile(settings.profiles, "Select profile to remove");
  if (!profile) {
    return;
  }

  const confirm = await vscode.window.showWarningMessage(
    `Remove profile '${profile.name}'? This does not remove remote files.`,
    { modal: true },
    "Remove"
  );

  if (confirm !== "Remove") {
    return;
  }

  const next = settings.profiles.filter((item) => item.id !== profile.id);
  await saveProfiles(next);
  await secretStore.clearProfileCredentials(profile.id);

  if (settings.defaultProfile === profile.id) {
    await saveDefaultProfile(undefined);
  }
  if (settings.workspaceDefaultProfile === profile.id) {
    await saveWorkspaceDefaultProfile(undefined);
  }

  void vscode.window.showInformationMessage(`Profile '${profile.name}' removed.`);
}

async function setWorkspaceDefaultProfile(): Promise<void> {
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    void vscode.window.showWarningMessage("Open a workspace file first to set workspace default profile.");
    return;
  }

  const settings = getSettings(editor.document.uri);
  if (!settings.profiles.length) {
    void vscode.window.showWarningMessage("No profiles configured.");
    return;
  }

  const profile = await pickProfile(settings.profiles, "Select workspace default profile");
  if (!profile) {
    return;
  }

  await saveWorkspaceDefaultProfile(profile.id, editor.document.uri);
  void vscode.window.showInformationMessage(`Workspace default set to '${profile.name}'.`);
}

async function switchActiveProfile(profileResolver: ProfileResolver): Promise<void> {
  const settings = getSettings();
  if (!settings.profiles.length) {
    void vscode.window.showWarningMessage("No profiles configured.");
    return;
  }

  const options = [
    ...settings.profiles.map((profile) => ({
      label: profile.name,
      description: `${profile.id} • ${profile.provider}`,
      value: profile.id
    })),
    {
      label: "Clear session override",
      description: "Use normal default resolution",
      value: "__clear__"
    }
  ];

  const picked = await vscode.window.showQuickPick(options, {
    placeHolder: "Select active session profile"
  });

  if (!picked) {
    return;
  }

  if (picked.value === "__clear__") {
    profileResolver.setSessionProfile(undefined);
    void vscode.window.showInformationMessage("Cleared session profile override.");
    return;
  }

  profileResolver.setSessionProfile(picked.value);
  const selected = settings.profiles.find((profile) => profile.id === picked.value);
  void vscode.window.showInformationMessage(`Session profile set to '${selected?.name ?? picked.value}'.`);
}

async function setProfileCredentials(secretStore: SecretStore, profileIdArg?: string): Promise<void> {
  const settings = getSettings();
  if (!settings.profiles.length) {
    void vscode.window.showWarningMessage("No profiles configured.");
    return;
  }

  let profile = settings.profiles.find((item) => item.id === profileIdArg);
  if (!profile) {
    profile = await pickProfile(settings.profiles, "Select profile for credentials");
  }
  if (!profile) {
    return;
  }

  const accessKeyId = await prompt("Access key id", "", (value) => (!value.trim() ? "Access key id is required." : undefined));
  if (!accessKeyId) {
    return;
  }

  const secretAccessKey = await prompt("Secret access key", "", (value) => (!value.trim() ? "Secret access key is required." : undefined), true);
  if (!secretAccessKey) {
    return;
  }

  await secretStore.setProfileCredentials(profile.id, {
    accessKeyId: accessKeyId.trim(),
    secretAccessKey: secretAccessKey.trim()
  });

  void vscode.window.showInformationMessage(`Credentials saved for '${profile.name}'.`);
}

async function clearProfileCredentials(secretStore: SecretStore, profileIdArg?: string): Promise<void> {
  const settings = getSettings();
  if (!settings.profiles.length) {
    void vscode.window.showWarningMessage("No profiles configured.");
    return;
  }

  let profile = settings.profiles.find((item) => item.id === profileIdArg);
  if (!profile) {
    profile = await pickProfile(settings.profiles, "Select profile to clear credentials");
  }
  if (!profile) {
    return;
  }

  const confirm = await vscode.window.showWarningMessage(
    `Clear stored credentials for '${profile.name}'?`,
    { modal: true },
    "Clear"
  );
  if (confirm !== "Clear") {
    return;
  }

  await secretStore.clearProfileCredentials(profile.id);
  void vscode.window.showInformationMessage(`Credentials cleared for '${profile.name}'.`);
}

async function promptProfileFields(base: Partial<Profile> & Pick<Profile, "id" | "name" | "provider">): Promise<Profile | undefined> {
  const bucket = await prompt("Bucket", base.bucket ?? "", (value) => (!value.trim() ? "Bucket is required." : undefined));
  if (!bucket) {
    return undefined;
  }

  const regionDefault = base.provider === "cloudflare-r2" ? "auto" : (base.region ?? "us-east-1");
  const region = await prompt("Region", regionDefault, (value) => (!value.trim() ? "Region is required." : undefined));
  if (!region) {
    return undefined;
  }

  let accountId = base.accountId;
  let endpoint = base.endpoint;

  if (base.provider === "cloudflare-r2") {
    accountId = await prompt(
      "Cloudflare account id (optional if endpoint provided)",
      base.accountId ?? ""
    ) ?? undefined;

    if (!accountId?.trim()) {
      endpoint = await prompt(
        "R2 endpoint (optional if account id provided)",
        base.endpoint ?? ""
      ) ?? undefined;
    }
  }

  if (base.provider === "custom-s3") {
    endpoint = await prompt("Custom S3 endpoint", base.endpoint ?? "", (value) => (!value.trim() ? "Endpoint is required." : undefined));
    if (!endpoint) {
      return undefined;
    }
  }

  if (base.provider === "aws-s3") {
    endpoint = await prompt("Custom endpoint override (optional)", base.endpoint ?? "") ?? undefined;
  }

  const publicBaseUrl = await prompt("Public base URL", base.publicBaseUrl ?? "", (value) => {
    if (!value.trim()) {
      return "Public base URL is required.";
    }
    if (!/^https?:\/\//i.test(value.trim())) {
      return "Public base URL must start with http:// or https://";
    }
    return undefined;
  });
  if (!publicBaseUrl) {
    return undefined;
  }

  const basePrefix = await prompt("Base prefix", base.basePrefix ?? "assets");
  if (!basePrefix) {
    return undefined;
  }

  let forcePathStyle = base.forcePathStyle ?? false;
  if (base.provider === "custom-s3") {
    const selected = await vscode.window.showQuickPick(
      [
        { label: "Use path style", value: true },
        { label: "Use virtual host style", value: false }
      ],
      { placeHolder: "Address style" }
    );
    if (!selected) {
      return undefined;
    }
    forcePathStyle = selected.value;
  }

  return {
    id: base.id,
    name: base.name,
    provider: base.provider,
    bucket: bucket.trim(),
    region: region.trim(),
    endpoint: endpoint?.trim() || undefined,
    accountId: accountId?.trim() || undefined,
    publicBaseUrl: publicBaseUrl.trim(),
    basePrefix: basePrefix.trim(),
    forcePathStyle
  };
}

async function validateProfileConnection(profile: Profile, credentials: ProfileCredentials): Promise<boolean> {
  try {
    const uploader = new S3Uploader(profile, credentials);
    await uploader.validateConnection();
    void vscode.window.showInformationMessage("Connection validation succeeded.");
    return true;
  } catch (error) {
    void vscode.window.showWarningMessage(`Connection validation failed: ${toMessage(error)}`);
    return false;
  }
}

async function promptForOptionalCredentials(): Promise<{ status: "skip" | "cancel"; credentials?: undefined } | { credentials: ProfileCredentials } | undefined> {
  const choice = await vscode.window.showQuickPick(
    [
      { label: "Set credentials now", value: "set" },
      { label: "Skip for now", value: "skip" }
    ],
    { placeHolder: "Credentials" }
  );

  if (!choice) {
    return { status: "cancel" };
  }

  if (choice.value === "skip") {
    return { status: "skip" };
  }

  const accessKeyId = await prompt("Access key id", "", (value) => (!value.trim() ? "Access key id is required." : undefined));
  if (!accessKeyId) {
    return { status: "cancel" };
  }

  const secretAccessKey = await prompt("Secret access key", "", (value) => (!value.trim() ? "Secret access key is required." : undefined), true);
  if (!secretAccessKey) {
    return { status: "cancel" };
  }

  return {
    credentials: {
      accessKeyId: accessKeyId.trim(),
      secretAccessKey: secretAccessKey.trim()
    }
  };
}

async function pickProvider(): Promise<ProviderType | undefined> {
  const picked = await vscode.window.showQuickPick(
    [
      { label: "AWS S3", description: "aws-s3", value: "aws-s3" as const },
      { label: "Cloudflare R2", description: "cloudflare-r2", value: "cloudflare-r2" as const },
      { label: "Custom S3-Compatible", description: "custom-s3", value: "custom-s3" as const }
    ],
    { placeHolder: "Select profile provider" }
  );

  return picked?.value;
}

async function pickProfile(profiles: Profile[], placeHolder: string): Promise<Profile | undefined> {
  const items = profiles.map((profile) => ({
    label: profile.name,
    description: `${profile.id} • ${profile.provider}`,
    detail: `${profile.bucket} • ${profile.publicBaseUrl}`,
    profile
  }));

  const selected = await vscode.window.showQuickPick(items, { placeHolder });
  return selected?.profile;
}

async function prompt(
  title: string,
  value: string,
  validateInput?: (value: string) => string | undefined,
  password = false
): Promise<string | undefined> {
  return vscode.window.showInputBox({
    title,
    value,
    password,
    ignoreFocusOut: true,
    validateInput
  });
}

function toMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}
