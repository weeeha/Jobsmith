import { describe, expect, it } from "vitest";
import { textToMarkdown, visibleTextLength } from "@/lib/intake/text";
import { MAX_POSTING_CHARS } from "@/lib/intake/values";

describe("textToMarkdown", () => {
  it("strips a leading BOM", () => {
    expect(textToMarkdown("﻿Hello world")).toBe("Hello world");
  });

  it("turns CRLF into LF, and gives each line its own paragraph", () => {
    expect(textToMarkdown("Line one\r\nLine two")).toBe("Line one\n\nLine two");
  });

  it("turns a lone CR into LF the same way", () => {
    expect(textToMarkdown("Line one\rLine two")).toBe("Line one\n\nLine two");
  });

  it("turns a no-break space into a regular space", () => {
    expect(textToMarkdown("Hello world")).toBe("Hello world");
  });

  it("turns a tab into a regular space", () => {
    expect(textToMarkdown("Hello\tworld")).toBe("Hello world");
  });

  it("trims trailing whitespace from a line before deciding whether it is blank", () => {
    expect(textToMarkdown("Hello   \nWorld  ")).toBe("Hello\n\nWorld");
  });

  const bulletGlyphs = ["•", "●", "▪", "◦", "·", "‣", "∙", "*", "–", "—", "-"];
  it.each(bulletGlyphs)("turns a %s bullet into a - list item", (glyph) => {
    expect(textToMarkdown(`${glyph} Item one`)).toBe("- Item one");
  });

  it("turns 'N)' and 'N.' (up to three digits) into 'N. ', keeping adjacent items on adjacent lines", () => {
    expect(textToMarkdown("1) First\n2) Second")).toBe("1. First\n2. Second");
    expect(textToMarkdown("123. Item")).toBe("123. Item");
  });

  it("gives every other non-blank line its own paragraph, separated by a blank line", () => {
    expect(textToMarkdown("First line\nSecond line\nThird line")).toBe("First line\n\nSecond line\n\nThird line");
  });

  it("collapses runs of blank lines to a single blank line", () => {
    expect(textToMarkdown("First\n\n\n\nSecond")).toBe("First\n\nSecond");
  });

  it("keeps a list's own items adjacent to each other, but separate from the paragraphs around it", () => {
    // This is the case the list-adjacency branch exists for: without it,
    // "- one" and "- two" would each become their own paragraph instead of
    // staying together as one list.
    expect(textToMarkdown("Intro\n- one\n- two\nOutro")).toBe("Intro\n\n- one\n- two\n\nOutro");
  });

  it("is idempotent: running it again on its own output changes nothing", () => {
    const inputs = [
      "﻿Hello world",
      "Line one\r\nLine two",
      "1) First\n2) Second",
      "First line\nSecond line\nThird line",
      "Intro\n- one\n- two\nOutro",
    ];
    for (const input of inputs) {
      const once = textToMarkdown(input);
      expect(textToMarkdown(once)).toBe(once);
    }
  });

  it("cuts the result to MAX_POSTING_CHARS", () => {
    const huge = "x".repeat(200_000);
    const result = textToMarkdown(huge);
    expect(result.length).toBe(MAX_POSTING_CHARS);
    expect(result).toBe("x".repeat(MAX_POSTING_CHARS));
  });
});

describe("visibleTextLength", () => {
  it("treats markdown punctuation as whitespace and counts what is left", () => {
    expect(visibleTextLength("## A\n\n- b")).toBe(3);
  });
});
