import * as vscode from "vscode";
import { ProfileCredentials } from "./types";

export class SecretStore {
  constructor(private readonly context: vscode.ExtensionContext) {}

  async getProfileCredentials(profileId: string): Promise<ProfileCredentials | undefined> {
    const [accessKeyId, secretAccessKey] = await Promise.all([
      this.context.secrets.get(this.accessKeyKey(profileId)),
      this.context.secrets.get(this.secretAccessKeyKey(profileId))
    ]);

    if (!accessKeyId || !secretAccessKey) {
      return undefined;
    }

    return { accessKeyId, secretAccessKey };
  }

  async setProfileCredentials(profileId: string, credentials: ProfileCredentials): Promise<void> {
    await Promise.all([
      this.context.secrets.store(this.accessKeyKey(profileId), credentials.accessKeyId),
      this.context.secrets.store(this.secretAccessKeyKey(profileId), credentials.secretAccessKey)
    ]);
  }

  async clearProfileCredentials(profileId: string): Promise<void> {
    await Promise.all([
      this.context.secrets.delete(this.accessKeyKey(profileId)),
      this.context.secrets.delete(this.secretAccessKeyKey(profileId))
    ]);
  }

  private accessKeyKey(profileId: string): string {
    return `mdxAssetManager.profile.${profileId}.accessKeyId`;
  }

  private secretAccessKeyKey(profileId: string): string {
    return `mdxAssetManager.profile.${profileId}.secretAccessKey`;
  }
}
