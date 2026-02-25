import { lookup as mimeLookup } from "mime-types";
import { InsertContext, InsertRule } from "../types";

const IMAGE_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg", ".avif", ".bmp"]);
const VIDEO_EXTENSIONS = new Set([".mp4", ".webm", ".mov", ".m4v", ".avi", ".mkv"]);

export function buildInsertSnippet(context: InsertContext, rules: InsertRule[]): string {
  const matchedRule = rules.find((rule) => matchesRule(rule, context));
  if (matchedRule) {
    return renderTemplate(matchedRule.template, context);
  }

  const isImage = context.mime.startsWith("image/") || IMAGE_EXTENSIONS.has(context.ext);
  const isVideo = context.mime.startsWith("video/") || VIDEO_EXTENSIONS.has(context.ext);

  if (context.languageId === "html") {
    if (isImage) {
      return `<img src="${context.url}" alt="${context.alt}" />`;
    }
    if (isVideo) {
      return `<video controls src="${context.url}"></video>`;
    }
    return `<a href="${context.url}">${context.filename}</a>`;
  }

  if (isImage) {
    return `![${context.alt}](${context.url})`;
  }
  if (isVideo) {
    return `<video controls src="${context.url}"></video>`;
  }
  return `[${context.filename}](${context.url})`;
}

export function createInsertContext(input: {
  languageId: string;
  filename: string;
  extension: string;
  url: string;
  key: string;
  mime?: string;
}): InsertContext {
  const mime = input.mime || (mimeLookup(input.filename) || "application/octet-stream").toString();
  const basename = input.filename.slice(0, Math.max(0, input.filename.length - input.extension.length));

  return {
    languageId: normalizeLanguageId(input.languageId),
    extension: input.extension.toLowerCase(),
    mime: mime.toLowerCase(),
    url: input.url,
    filename: input.filename,
    basename,
    ext: input.extension.toLowerCase(),
    key: input.key,
    alt: humanizeAlt(basename)
  };
}

export function renderTemplate(template: string, context: InsertContext): string {
  return template.replace(/\$\{(url|filename|basename|ext|mime|key|alt)\}/g, (_value, token: keyof InsertContext) => context[token]);
}

function matchesRule(rule: InsertRule, context: InsertContext): boolean {
  const languageMatch = rule.when.languageIds.map((id) => normalizeLanguageId(id)).includes(context.languageId);
  if (!languageMatch) {
    return false;
  }

  if (rule.when.extensions?.length) {
    const extensions = rule.when.extensions.map((value) => value.toLowerCase());
    if (!extensions.includes(context.ext)) {
      return false;
    }
  }

  if (rule.when.mimePrefixes?.length) {
    const prefixes = rule.when.mimePrefixes.map((value) => value.toLowerCase());
    if (!prefixes.some((prefix) => context.mime.startsWith(prefix))) {
      return false;
    }
  }

  return true;
}

function normalizeLanguageId(languageId: string): string {
  const normalized = languageId.toLowerCase();
  if (normalized === "javascriptreact") {
    return "jsx";
  }
  if (normalized === "typescriptreact") {
    return "tsx";
  }
  return normalized;
}

function humanizeAlt(name: string): string {
  const normalized = name.replace(/[-_]+/g, " ").trim();
  return normalized || "asset";
}
