import { describe, expect, it } from "vitest";
import { buildInsertSnippet, createInsertContext, renderTemplate } from "../src/insert/patternEngine";

describe("patternEngine", () => {
  it("renders custom template", () => {
    const context = createInsertContext({
      languageId: "mdx",
      filename: "hero.mp4",
      extension: ".mp4",
      url: "https://cdn.example.com/assets/hero.mp4",
      key: "assets/hero.mp4",
      mime: "video/mp4"
    });

    const snippet = buildInsertSnippet(context, [
      {
        when: {
          languageIds: ["mdx"],
          mimePrefixes: ["video/"]
        },
        template: "<Video src=\"${url}\" />"
      }
    ]);

    expect(snippet).toBe("<Video src=\"https://cdn.example.com/assets/hero.mp4\" />");
  });

  it("falls back to markdown image template", () => {
    const context = createInsertContext({
      languageId: "markdown",
      filename: "cover.png",
      extension: ".png",
      url: "https://cdn.example.com/assets/cover.png",
      key: "assets/cover.png",
      mime: "image/png"
    });

    expect(buildInsertSnippet(context, [])).toBe("![cover](https://cdn.example.com/assets/cover.png)");
  });

  it("renders token substitution", () => {
    const context = createInsertContext({
      languageId: "html",
      filename: "x.pdf",
      extension: ".pdf",
      url: "https://cdn.example.com/x.pdf",
      key: "x.pdf",
      mime: "application/pdf"
    });

    expect(renderTemplate("${filename}|${ext}|${alt}", context)).toBe("x.pdf|.pdf|x");
  });
});
