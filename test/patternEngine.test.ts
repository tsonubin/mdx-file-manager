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


describe("custom template interpolation sinks", () => {
  const input = {
    filename: 'clip](x)"\'&<>.mp4',
    url: 'https://cdn.example.com/media(v2)/clip[1].mp4?a=1&b="x"',
    key: "assets/clip.mp4",
    mime: "video/mp4"
  };

  it.each(["markdown", "mdx", "html", "jsx", "tsx"])(
    "preserves URL punctuation and escapes attribute delimiters in %s rules",
    (languageId) => {
      const context = createInsertContext({ ...input, languageId });
      expect(buildInsertSnippet(context, [{
        when: { languageIds: [languageId] },
        template: '<video controls src="${url}" title=\'${filename}\'></video>'
      }])).toBe(
        '<video controls src="https://cdn.example.com/media(v2)/clip[1].mp4?a=1&amp;b=&quot;x&quot;" title=\'clip](x)&quot;&#39;&amp;&lt;&gt;.mp4\'></video>'
      );
    }
  );

  it("escapes each sink independently in a mixed MDX template", () => {
    const context = createInsertContext({ ...input, languageId: "mdx" });
    expect(renderTemplate('<Video title="a > b" src="${url}" /> [${filename}](${url})', context)).toBe(
      '<Video title="a > b" src="https://cdn.example.com/media(v2)/clip[1].mp4?a=1&amp;b=&quot;x&quot;" /> [clip\\]\\(x\\)&quot;&#39;&amp;&lt;&gt;.mp4](https://cdn.example.com/media\\(v2\\)/clip\\[1\\].mp4?a=1&amp;b=&quot;x&quot;)'
    );
  });

  it("does not let a substituted value change the next interpolation sink", () => {
    const context = createInsertContext({ ...input, languageId: "mdx", filename: '\"><img src="' });
    expect(renderTemplate('<Video title="${filename}" src="${url}" />', context)).toBe(
      '<Video title="&quot;&gt;&lt;img src=&quot;" src="https://cdn.example.com/media(v2)/clip[1].mp4?a=1&amp;b=&quot;x&quot;" />'
    );
  });

  it("retains Markdown escaping for custom links and literal backslashes in attributes", () => {
    const context = createInsertContext({ ...input, languageId: "mdx", url: "https://cdn.example.com/a b(v2)\\c.mp4" });
    expect(renderTemplate('[clip](${url}) <Video src="${url}" />', context)).toBe(
      '[clip](https://cdn.example.com/a%20b\\(v2\\)\\\\c.mp4) <Video src="https://cdn.example.com/a b(v2)\\c.mp4" />'
    );
  });
});
