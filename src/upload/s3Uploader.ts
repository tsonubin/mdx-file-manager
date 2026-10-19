import * as fs from "node:fs/promises";
import { createReadStream } from "node:fs";
import {
  DeleteObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
  S3ServiceException
} from "@aws-sdk/client-s3";
import { lookup as mimeLookup } from "mime-types";
import { Profile, ProfileCredentials, AssetRecord } from "../types";
import { joinUrl } from "../utils";

export interface ListedObject {
  key: string;
  size?: number;
  lastModified?: Date;
}

export class S3Uploader {
  private readonly client: S3Client;

  // Credentials are always explicit (SecretStorage); there is deliberately no
  // ambient AWS chain fallback.
  constructor(private readonly profile: Profile, private readonly credentials: ProfileCredentials) {
    this.client = new S3Client({
      region: resolveRegion(profile),
      endpoint: resolveEndpoint(profile),
      forcePathStyle: profile.forcePathStyle ?? profile.provider === "custom-s3",
      credentials: {
        accessKeyId: credentials.accessKeyId,
        secretAccessKey: credentials.secretAccessKey
      }
    });
  }

  async uploadFile(localPath: string, key: string, options?: { abortSignal?: AbortSignal }): Promise<string> {
    const contentType = mimeLookup(localPath) || "application/octet-stream";
    // Stream the body: maxUploadSizeMB defaults to 100MB, so buffering the
    // whole file would pin it in memory for the duration of the PUT.
    const { size } = await fs.stat(localPath);

    await this.client.send(
      new PutObjectCommand({
        Bucket: this.profile.bucket,
        Key: key,
        Body: createReadStream(localPath),
        ContentLength: size,
        ContentType: contentType
      }),
      { abortSignal: options?.abortSignal }
    );

    return joinUrl(this.profile.publicBaseUrl, key);
  }

  async keyExists(key: string, options?: { abortSignal?: AbortSignal }): Promise<boolean | "unknown"> {
    try {
      await this.client.send(
        new HeadObjectCommand({
          Bucket: this.profile.bucket,
          Key: key
        }),
        { abortSignal: options?.abortSignal }
      );
      return true;
    } catch (error) {
      const status = error instanceof S3ServiceException ? error.$metadata.httpStatusCode : undefined;
      const name = error instanceof S3ServiceException ? error.name : undefined;
      if (status === 404 || name === "NotFound") {
        return false;
      }
      if (status === 403 || name === "AccessDenied" || name === "Forbidden") {
        // Least-privilege keys without s3:ListBucket (and some MinIO setups)
        // answer 403 for missing objects; uniqueness cannot be verified.
        return "unknown";
      }
      throw error;
    }
  }

  async listByPrefix(prefix: string): Promise<ListedObject[]> {
    const all: ListedObject[] = [];
    let token: string | undefined;
    do {
      const output = await this.client.send(
        new ListObjectsV2Command({
          Bucket: this.profile.bucket,
          Prefix: prefix,
          ContinuationToken: token
        })
      );

      for (const item of output.Contents ?? []) {
        if (!item.Key) {
          continue;
        }
        all.push({
          key: item.Key,
          size: item.Size,
          lastModified: item.LastModified
        });
      }

      token = output.IsTruncated ? output.NextContinuationToken : undefined;
    } while (token);

    return all;
  }

  async deleteObject(key: string): Promise<void> {
    await this.client.send(
      new DeleteObjectCommand({
        Bucket: this.profile.bucket,
        Key: key
      })
    );
  }

  async validateConnection(options?: { readOnly?: boolean }): Promise<void> {
    await this.client.send(
      new ListObjectsV2Command({
        Bucket: this.profile.bucket,
        MaxKeys: 1
      })
    );

    if (options?.readOnly) {
      return;
    }

    const probeKey = `__mdx_asset_manager_probe__/${Date.now()}.txt`;
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.profile.bucket,
        Key: probeKey,
        Body: "ok",
        ContentType: "text/plain"
      })
    );

    await this.client.send(
      new DeleteObjectCommand({
        Bucket: this.profile.bucket,
        Key: probeKey
      })
    );
  }

  toAssetRecord(item: ListedObject): AssetRecord {
    return {
      profileId: this.profile.id,
      profileName: this.profile.name,
      key: item.key,
      url: joinUrl(this.profile.publicBaseUrl, item.key),
      size: item.size,
      lastModified: item.lastModified
    };
  }
}

function resolveEndpoint(profile: Profile): string | undefined {
  if (profile.endpoint) {
    return profile.endpoint;
  }

  if (profile.provider === "cloudflare-r2" && profile.accountId) {
    return `https://${profile.accountId}.r2.cloudflarestorage.com`;
  }

  return undefined;
}

function resolveRegion(profile: Profile): string {
  if (profile.region?.trim()) {
    return profile.region.trim();
  }
  if (profile.provider === "cloudflare-r2") {
    return "auto";
  }
  return "us-east-1";
}
