import type * as vscode from "vscode";

export type ProviderType = "aws-s3" | "cloudflare-r2" | "custom-s3";

export interface Profile {
  id: string;
  name: string;
  provider: ProviderType;
  bucket: string;
  region?: string;
  endpoint?: string;
  accountId?: string;
  publicBaseUrl: string;
  basePrefix?: string;
  forcePathStyle?: boolean;
}

export interface InsertRule {
  when: {
    languageIds: string[];
    extensions?: string[];
    mimePrefixes?: string[];
  };
  template: string;
}

export interface ExtensionSettings {
  profiles: Profile[];
  defaultProfile?: string;
  workspaceDefaultProfile?: string;
  allowedExtensions: string[];
  maxUploadSizeMB: number;
  insertRules: InsertRule[];
}

export interface ProfileCredentials {
  accessKeyId: string;
  secretAccessKey: string;
}

export interface ActiveDocScope {
  document: vscode.TextDocument;
  workspaceFolder?: vscode.WorkspaceFolder;
  relativePath: string;
  relativeDir: string;
  fileBaseName: string;
  keyPrefix: string;
}

export interface InsertContext {
  languageId: string;
  extension: string;
  mime: string;
  url: string;
  filename: string;
  basename: string;
  ext: string;
  key: string;
  alt: string;
}

export interface AssetRecord {
  profileId: string;
  profileName: string;
  key: string;
  url: string;
  size?: number;
  lastModified?: Date;
}

export interface UploadResult {
  key: string;
  url: string;
  snippet: string;
}

export interface UploadFailure {
  file: string;
  reason: string;
}

export interface UploadBatchResult {
  uploaded: UploadResult[];
  failures: UploadFailure[];
}

export interface ResolvedProfile {
  profile: Profile;
  source: "session" | "workspaceDefault" | "userDefault" | "single" | "picked";
}
