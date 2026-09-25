import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { Markdown } from "@/components/markdown";

function html(source: string, headingBase: 2 | 3 | 4 = 2): string {
  return renderToStaticMarkup(<Markdown source={source} headingBase={headingBase} />);
}

describe("Markdown", () => {
  it("wraps the rendered body in a break-words text-sm text-foreground container", () => {
    expect(html("Body text.")).toMatch(/^<div class="break-words text-sm text-foreground">/);
  });

  it("re-tags headings starting at headingBase, ranking the distinct levels used", () => {
    const out = html("# Title\n\n### Sub", 3);
    expect(out).toMatch(/<h3[^>]*>Title<\/h3>/);
    expect(out).toMatch(/<h4[^>]*>Sub<\/h4>/);
  });

  it("wraps a GFM table in a tabIndex=0 overflow-x-auto bordered container", () => {
    const out = html(["| A | B |", "|---|---|", "| 1 | 2 |"].join("\n"));
    expect(out).toMatch(/<div tabindex="0" class="overflow-x-auto rounded-md border border-border"><table/);
    expect(out).toMatch(/<td>1<\/td>/);
  });

  it("gives a fenced code block's own pre element tabIndex=0 and overflow-x-auto", () => {
    const out = html(["```", "code line", "```"].join("\n"));
    expect(out).toMatch(/<pre tabindex="0" class="[^"]*overflow-x-auto[^"]*">/);
  });

  it.each([
    ["http://example.com/a", true],
    ["https://example.com/a", true],
    ["mailto:a@example.com", true],
    ["javascript:alert(1)", false],
    ["data:text/html;base64,PHNjcmlwdD4=", false],
    ["./relative-notes.md", false],
    ["#fragment", false],
  ])("link %s becomes a real anchor: %s", (href, shouldLink) => {
    const out = html(`[text](${href})`);
    if (shouldLink) {
      expect(out).toContain(`href="${href}"`);
      expect(out).toMatch(/<a[^>]*>text<\/a>/);
    } else {
      expect(out).not.toContain("<a ");
      expect(out).not.toContain("<a>");
      expect(out).toContain(">text<");
    }
  });

  it("never loads an image: renders the literal text Image: <alt> instead of an <img> tag", () => {
    const out = html("![a screenshot of the offer letter](https://tracker.example/p.png)");
    expect(out).not.toContain("<img");
    expect(out).toContain("Image: a screenshot of the offer letter");
  });

  it("marks a checked task-list item Done and an unchecked one Not done, both disabled", () => {
    const out = html("- [x] done task\n- [ ] open task");
    const doneItem = /<li class="task-list-item"><input([^>]*)\/> done task<\/li>/.exec(out)?.[1] ?? "";
    const openItem = /<li class="task-list-item"><input([^>]*)\/> open task<\/li>/.exec(out)?.[1] ?? "";
    expect(doneItem).toContain('checked=""');
    expect(doneItem).toContain('aria-label="Done"');
    expect(doneItem).toContain('disabled=""');
    expect(openItem).not.toContain('checked=""');
    expect(openItem).toContain('aria-label="Not done"');
    expect(openItem).toContain('disabled=""');
  });

  it("drops raw HTML entirely rather than showing it as escaped text", () => {
    const out = html('<script>alert(1)</script>\n\n<img src="x" onerror="alert(1)">\n\nInline <b>bold</b> and <!-- hidden --> text.');
    expect(out).not.toMatch(/<script/i);
    expect(out).not.toMatch(/alert\(1\)/);
    expect(out).not.toMatch(/onerror/i);
    expect(out).not.toMatch(/<b>/);
    expect(out).not.toMatch(/hidden/);
    expect(out).not.toMatch(/&lt;script&gt;/); // not even escaped-to-text
  });

  it("still renders GFM strikethrough and autolinks through the full sanitize pipeline", () => {
    const out = html("~~struck~~ and www.example.org autolink");
    expect(out).toMatch(/<del>struck<\/del>/);
    expect(out).toMatch(/href="http:\/\/www.example.org"/);
  });

  it("accepts every headingBase the type allows", () => {
    expect(html("# X", 2)).toMatch(/<h2[^>]*>X<\/h2>/);
    expect(html("# X", 3)).toMatch(/<h3[^>]*>X<\/h3>/);
    expect(html("# X", 4)).toMatch(/<h4[^>]*>X<\/h4>/);
  });
});
