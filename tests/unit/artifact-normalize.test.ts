import { describe, expect, it } from "vitest";
import { normalizeBody, hashBody, utf8Bytes, deriveTitle, keyFromTitle } from "@/lib/artifacts/normalize";

describe("normalizeBody", () => {
  it("converts CRLF to LF and drops the trailing newline", () => {
    expect(normalizeBody("# Title\r\nBody\r\n")).toBe("# Title\nBody");
  });

  it("converts a lone CR to LF", () => {
    expect(normalizeBody("a\rb\r")).toBe("a\nb");
  });

  it("strips a leading BOM", () => {
    expect(normalizeBody("﻿# Title\n")).toBe("# Title");
  });

  it("trims trailing spaces and tabs on every line", () => {
    expect(normalizeBody("a  \nb\t\t\nc \t \n")).toBe("a\nb\nc");
  });

  it("drops trailing blank lines, not just the final newline", () => {
    expect(normalizeBody("a\nb\n\n\n\n")).toBe("a\nb");
  });

  it("normalizes an all-whitespace body to the empty string", () => {
    expect(normalizeBody("   \n\t\n  \n")).toBe("");
  });

  it("leaves an already-normalized body unchanged", () => {
    expect(normalizeBody("# Title\n\nBody text.")).toBe("# Title\n\nBody text.");
  });

  it("strips NUL characters, which Postgres text columns cannot store", () => {
    expect(normalizeBody("# Title\u0000\nBody\u0000 text.")).toBe("# Title\nBody text.");
  });
});

describe("hashBody", () => {
  it("returns a 64-character lowercase hex sha256 digest", () => {
    const hash = hashBody("hello");
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("is deterministic and sensitive to every character", () => {
    expect(hashBody("a")).toBe(hashBody("a"));
    expect(hashBody("a")).not.toBe(hashBody("b"));
  });
});

describe("utf8Bytes", () => {
  it("counts UTF-8 bytes, not UTF-16 code units or characters", () => {
    expect(utf8Bytes("abc")).toBe(3);
    expect(utf8Bytes("café")).toBe(5); // é is 2 bytes in UTF-8, 1 UTF-16 code unit
    expect(utf8Bytes("")).toBe(0);
  });
});

describe("deriveTitle", () => {
  it("uses the given title, trimmed, when one is provided", () => {
    expect(deriveTitle({ title: "  Cover letter  ", bodyMd: "# Something else", key: "k" })).toBe("Cover letter");
  });

  it("ignores a blank given title and falls back to the first H1", () => {
    expect(deriveTitle({ title: "   ", bodyMd: "intro line\n# Real title\nmore", key: "k" })).toBe("Real title");
  });

  it("strips a closing hash sequence from the H1", () => {
    expect(deriveTitle({ bodyMd: "# My Title ###", key: "k" })).toBe("My Title");
  });

  it("does not treat an H2 or a hash with no space as an H1", () => {
    expect(deriveTitle({ bodyMd: "## Not an H1\n#NoSpaceEither\nplain text", key: "the-key" })).toBe("the-key");
  });

  it("falls back to the key when there is no title and no H1", () => {
    expect(deriveTitle({ bodyMd: "no heading here at all", key: "fallback-key" })).toBe("fallback-key");
  });

  it("clips to 200 characters regardless of which source won", () => {
    expect(deriveTitle({ title: "T".repeat(250), bodyMd: "", key: "k" })).toHaveLength(200);
    expect(deriveTitle({ bodyMd: `# ${"H".repeat(250)}`, key: "k" })).toHaveLength(200);
  });

  it("strips a NUL character from a given title or an H1-derived one", () => {
    expect(deriveTitle({ title: "CV\u0000 final", bodyMd: "", key: "k" })).toBe("CV final");
    expect(deriveTitle({ bodyMd: "# Title\u0000 here", key: "k" })).toBe("Title here");
  });
});

describe("keyFromTitle", () => {
  it("lowercases and strips accents", () => {
    expect(keyFromTitle("Café Kréme Notes")).toBe("cafe-kreme-notes");
  });

  it("strips symbols and collapses the remaining words", () => {
    expect(keyFromTitle("Q&A: Round 2!")).toBe("qa-round-2");
  });

  it("falls back to document when nothing survives", () => {
    expect(keyFromTitle("!!!")).toBe("document");
    expect(keyFromTitle("")).toBe("document");
  });

  it("caps at 60 characters with no trailing hyphen", () => {
    const key = keyFromTitle("word ".repeat(30));
    expect(key.length).toBeLessThanOrEqual(60);
    expect(key.endsWith("-")).toBe(false);
  });
});
