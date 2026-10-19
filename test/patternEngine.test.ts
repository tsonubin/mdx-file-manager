import { describe, expect, it } from "vitest";
import { buildInsertSnippet, createInsertContext, renderTemplate } from "../src/insert/patternEngine";

describe("patternEngine", () => {
  it("renders custom template", () => {
    const context = createInsertContext({
      languageId: "mdx",
      filename: "hero.mp4",
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
      url: "https://cdn.example.com/x.pdf",
      key: "x.pdf",
      mime: "application/pdf"
    });

    expect(renderTemplate("${filename}|${ext}|${alt}", context)).toBe("x.pdf|.pdf|x");
  });

  it("neutralizes crafted filenames and urls in snippets", () => {
    const htmlContext = createInsertContext({
      languageId: "html",
      filename: 'a" onerror="x.png',
      url: 'https://cdn.example.com/a.png" bad="y',
      key: "assets/a.png",
      mime: "image/png"
    });

    expect(buildInsertSnippet(htmlContext, [])).toBe(
      '<img src="https://cdn.example.com/a.png&quot; bad=&quot;y" alt="a&quot; onerror=&quot;x" />'
    );

    const mdContext = createInsertContext({
      languageId: "markdown",
      filename: "a](evil).png",
      url: "https://cdn.example.com/a b.png",
      key: "assets/a b.png",
      mime: "image/png"
    });

    expect(buildInsertSnippet(mdContext, [])).toBe("![a\\]\\(evil\\)](https://cdn.example.com/a%20b.png)");
  });

  it("derives ext and basename from the filename", () => {
    const dotted = createInsertContext({
      languageId: "markdown",
      filename: "archive.tar.gz",
      url: "https://cdn.example.com/assets/v1.2/archive.tar.gz",
      key: "assets/v1.2/archive.tar.gz"
    });
    expect(dotted.ext).toBe(".gz");
    expect(dotted.basename).toBe("archive.tar");

    const bare = createInsertContext({
      languageId: "markdown",
      filename: "hero",
      url: "https://cdn.example.com/assets/v1.2/hero",
      key: "assets/v1.2/hero"
    });
    expect(bare.ext).toBe("");
    expect(bare.basename).toBe("hero");
  });
});
