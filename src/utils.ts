import * as path from "path";
import * as vscode from "vscode";

export const SUPPORTED_LANGUAGE_IDS = new Set(["markdown", "mdx", "html"]);

export function isSupportedDocument(document: vscode.TextDocument): boolean {
  return SUPPORTED_LANGUAGE_IDS.has(document.languageId) || [".md", ".mdx", ".html", ".htm"].includes(path.extname(document.fileName).toLowerCase());
}

export function sanitizeSegment(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/(^-|-$)/g, "") || "item";
}

export function ensureLeadingDot(ext: string): string {
  if (!ext) {
    return "";
  }
  return ext.startsWith(".") ? ext.toLowerCase() : `.${ext.toLowerCase()}`;
}

export function joinUrl(baseUrl: string, key: string): string {
  const trimmedBase = baseUrl.replace(/\/+$/g, "");
  const trimmedKey = key.replace(/^\/+/, "");
  return `${trimmedBase}/${trimmedKey}`;
}

export function pathToPosix(input: string): string {
  return input.split(path.sep).join("/");
}

export function relativePathOrBasename(document: vscode.TextDocument, workspaceFolder?: vscode.WorkspaceFolder): string {
  if (workspaceFolder) {
    return pathToPosix(path.relative(workspaceFolder.uri.fsPath, document.uri.fsPath));
  }
  return path.basename(document.uri.fsPath);
}

export function stripExtension(filename: string): string {
  const ext = path.extname(filename);
  return ext ? filename.slice(0, -ext.length) : filename;
}

export function formatBytes(size?: number): string {
  if (typeof size !== "number" || Number.isNaN(size)) {
    return "";
  }
  if (size < 1024) {
    return `${size} B`;
  }
  const kb = size / 1024;
  if (kb < 1024) {
    return `${kb.toFixed(1)} KB`;
  }
  const mb = kb / 1024;
  if (mb < 1024) {
    return `${mb.toFixed(1)} MB`;
  }
  return `${(mb / 1024).toFixed(1)} GB`;
}

// Single shape for error text on every UI surface: the error name and HTTP
// status lead (S3 failures otherwise arrive as bare messages), trivial "Error"
// names are dropped, and empty messages say so instead of rendering blank.
export function describeError(error: unknown): string {
  if (!(error instanceof Error)) {
    return String(error);
  }
  const parts: string[] = [];
  if (error.name && error.name !== "Error") {
    parts.push(error.name);
  }
  const metadata: unknown = "$metadata" in error ? error.$metadata : undefined;
  if (typeof metadata === "object" && metadata !== null && "httpStatusCode" in metadata && typeof metadata.httpStatusCode === "number") {
    parts.push(`HTTP ${metadata.httpStatusCode}`);
  }
  parts.push(error.message || "no details");
  return parts.join(" — ");
}
