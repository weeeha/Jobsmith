import { describe, expect, it } from "vitest";
import { htmlToMarkdown, decodeIfEncoded } from "@/lib/intake/html";
import { MAX_ARTICLE_HTML } from "@/lib/intake/values";

describe("htmlToMarkdown", () => {
  it("turns h1/h2 into atx headings", () => {
    expect(htmlToMarkdown("<h1>Title</h1><h2>Sub</h2>")).toBe("# Title\n\n## Sub");
  });

  it("turns <ul> into - list items", () => {
    expect(htmlToMarkdown("<ul><li>One</li><li>Two</li></ul>")).toBe("- One\n- Two");
  });

  it("turns <ol> into numbered list items", () => {
    expect(htmlToMarkdown("<ol><li>First</li><li>Second</li></ol>")).toBe("1. First\n2. Second");
  });

  it("keeps <strong> as ** bold **", () => {
    expect(htmlToMarkdown("<p>Keep <strong>this</strong> word.</p>")).toBe("Keep **this** word.");
  });

  it("removes script, style, img and form content, keeping the surrounding text", () => {
    const html = "<p>Visible</p><script>bad()</script><style>.a{}</style><img src=x><form><input></form>";
    expect(htmlToMarkdown(html)).toBe("Visible");
  });

  it("cuts the html to MAX_ARTICLE_HTML before converting, so content past the cut never appears", () => {
    const filler = "<p>filler text here. </p>";
    const repeatCount = Math.ceil((MAX_ARTICLE_HTML + 50_000) / filler.length);
    const html = `<div>${filler.repeat(repeatCount)}<p>zzMARKERBEYONDCUTzz</p></div>`;
    expect(html.length).toBeGreaterThan(MAX_ARTICLE_HTML);
    expect(htmlToMarkdown(html)).not.toContain("zzMARKERBEYONDCUTzz");
  });
});

describe("decodeIfEncoded", () => {
  it("decodes HTML that was entity-encoded (Greenhouse's content field)", () => {
    const original = "<h2>What you will do</h2><p>Ship weekly.</p>";
    const encoded = original.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    expect(decodeIfEncoded(encoded)).toContain("<h2>What you will do</h2>");
  });

  it("leaves real HTML (containing a tag) alone, even if it also has an entity", () => {
    expect(decodeIfEncoded("<p>a &amp; b</p>")).toBe("<p>a &amp; b</p>");
  });
});
