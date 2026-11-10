import * as path from "node:path";
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
      return `<img src="${escapeHtml(context.url)}" alt="${escapeHtml(context.alt)}" />`;
    }
    if (isVideo) {
      return `<video controls src="${escapeHtml(context.url)}"></video>`;
    }
    return `<a href="${escapeHtml(context.url)}">${escapeHtml(context.filename)}</a>`;
  }

  if (isImage) {
    return `![${escapeMarkdown(context.alt)}](${escapeMarkdownUrl(context.url)})`;
  }
  if (isVideo) {
    return `<video controls src="${escapeHtml(context.url)}"></video>`;
  }
  return `[${escapeMarkdown(context.filename)}](${escapeMarkdownUrl(context.url)})`;
}

export function createInsertContext(input: {
  languageId: string;
  filename: string;
  url: string;
  key: string;
  mime?: string;
}): InsertContext {
  const mime = input.mime || (mimeLookup(input.filename) || "application/octet-stream").toString();
  // Derive ext/basename from the filename itself. Callers used to pass their
  // own extension, and one derived it from the whole key, so a dotted
  // directory name corrupted basename and alt.
  const ext = path.extname(input.filename).toLowerCase();
  const basename = input.filename.slice(0, Math.max(0, input.filename.length - ext.length));

  return {
    languageId: normalizeLanguageId(input.languageId),
    mime: mime.toLowerCase(),
    url: input.url,
    filename: input.filename,
    basename,
    ext,
    key: input.key,
    alt: humanizeAlt(basename)
  };
}

export const TEMPLATE_TOKENS = ["url", "filename", "basename", "ext", "mime", "key", "alt"] as const;

// A token name is only meaningful next to the InsertContext field it reads.
export function isTemplateToken(token: string): token is keyof InsertContext {
  return (TEMPLATE_TOKENS as readonly string[]).includes(token);
}

export function renderTemplate(template: string, context: InsertContext): string {
  return template.replace(/\$\{([a-zA-Z]+)\}/g, (match, token: string, offset: number) => {
    if (!isTemplateToken(token)) {
      return match;
    }
    const value = context[token];
    if (context.languageId === "html" || isQuotedAttribute(template, offset)) {
      return escapeHtml(value);
    }
    return token === "url" || token === "key" ? escapeMarkdownUrl(value) : escapeMarkdown(value);
  });
}

// Markdown/MDX rules can mix Markdown links with HTML/JSX tags. Determine
// the sink from the original template, never from interpolated values.
// In quoted attributes, backslashes are literal, not Markdown escapes.
function isQuotedAttribute(template: string, offset: number): boolean {
  let inTag = false;
  let quote: string | undefined;
  for (let i = 0; i < offset; i += 1) {
    const char = template[i];
    if (!inTag) {
      if (char === "<" && /^\/?[a-zA-Z]/.test(template.slice(i + 1))) {
        inTag = true;
      }
    } else if (quote) {
      if (char === quote) {
        quote = undefined;
      }
    } else if (char === '"' || char === "'") {
      quote = char;
    } else if (char === ">") {
      inTag = false;
    }
  }
  return inTag && quote !== undefined;
}

const HTML_ENTITIES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;"
};

// Snippet values are attacker-controllable (filenames, user-configured
// publicBaseUrl). Every interpolation is escaped for its sink so a crafted
// value cannot break out of the generated markup or link. Entity escaping is
// decoded by HTML, JSX and CommonMark, so it stays invisible in rendered
// output; markdown structure chars additionally get backslashes, which
// CommonMark renders away but HTML/JSX attribute sinks never see.
function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => HTML_ENTITIES[char]);
}

function escapeMarkdown(value: string): string {
  return escapeHtml(value).replace(/([\\[\]()])/g, "\\$1");
}

function escapeMarkdownUrl(value: string): string {
  return escapeMarkdown(value).replace(/ /g, "%20");
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
