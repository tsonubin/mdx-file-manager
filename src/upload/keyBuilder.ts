import * as path from "node:path";
import { ActiveDocScope, Profile } from "../types";
import { sanitizeSegment, stripExtension } from "../utils";

export function buildScopePrefix(scope: Pick<ActiveDocScope, "relativeDir" | "fileBaseName">, profile: Profile): string {
  const basePrefix = sanitizeSegment(profile.basePrefix || "assets");
  const pathDir = scope.relativeDir === "." ? "" : scope.relativeDir;

  const segments = [basePrefix];
  if (pathDir) {
    for (const segment of pathDir.split("/")) {
      const normalized = sanitizeSegment(segment);
      if (normalized) {
        segments.push(normalized);
      }
    }
  }

  segments.push(sanitizeSegment(scope.fileBaseName));

  return segments.join("/");
}

export function buildObjectKey(prefix: string, filePath: string, suffix?: string): string {
  const ext = path.extname(filePath).toLowerCase();
  const filenameBase = stripExtension(path.basename(filePath));
  const sanitizedBase = sanitizeSegment(filenameBase);
  const normalizedSuffix = suffix ? `-${sanitizeSegment(suffix)}` : "";
  const finalName = `${sanitizedBase}${normalizedSuffix}${ext}`;
  return `${prefix}/${finalName}`.replace(/\/+/g, "/");
}

export function shortUniqueSuffix(): string {
  return Math.random().toString(36).slice(2, 8);
}
