import { describe, expect, it } from "vitest";
import { includeMatches, makeIncludeResolver } from "@/lib/prep/includes";

describe("includeMatches", () => {
  it("matches 'answers-full.md' to key 'answers-full'", () => {
    expect(includeMatches("answers-full.md", "answers-full")).toBe(true);
  });

  it("matches 'nwt-answers-full.md' to key 'answers-full' (the company prefix)", () => {
    expect(includeMatches("nwt-answers-full.md", "answers-full")).toBe(true);
  });

  it("matches 'curveballs.md' to key 'nwt-curveballs'", () => {
    expect(includeMatches("curveballs.md", "nwt-curveballs")).toBe(true);
  });

  it("does not match 'answers.md' to 'answers-full'", () => {
    expect(includeMatches("answers.md", "answers-full")).toBe(false);
  });
});

const CURVEBALLS = [
  "# Curveballs",
  "",
  '### 1. "What is your biggest weakness?"',
  "**Say:** I over-polish.",
  "",
  '### 2. "Describe a conflict"',
  "**Spine:** Listen, then fix.",
  "",
  "**Say:** I listen first.",
  "",
  "**Follow-up:** Then I propose a fix.",
  "{{include nwt-other.md 1}}",
].join("\n");

describe("makeIncludeResolver", () => {
  it("prefers the exact key over a suffix match", () => {
    const resolver = makeIncludeResolver([
      { key: "nwt-curveballs", bodyMd: '### 1. "Suffix"\n**Say:** from the suffix document' },
      { key: "curveballs", bodyMd: '### 1. "Exact"\n**Say:** from the exact document' },
    ]);
    expect(resolver("curveballs.md", 1)).toEqual([
      { label: "Say", spoken: true, text: "from the exact document" },
    ]);
  });

  it("a resolver returns only the spoken blocks of question N and null for an unknown question", () => {
    const resolver = makeIncludeResolver([{ key: "nwt-curveballs", bodyMd: CURVEBALLS }]);
    expect(resolver("curveballs.md", 2)).toEqual([
      { label: "Say", spoken: true, text: "I listen first." },
      { label: "Follow-up", spoken: true, text: "Then I propose a fix." },
    ]);
    expect(resolver("curveballs.md", 9)).toBeNull();
    expect(resolver("missing.md", 1)).toBeNull();
  });

  it("does not resolve an include inside an included question (depth one)", () => {
    const resolver = makeIncludeResolver([
      { key: "nwt-curveballs", bodyMd: CURVEBALLS },
      { key: "nwt-other", bodyMd: '### 1. "Other"\n**Say:** should not appear' },
    ]);
    const blocks = resolver("curveballs.md", 2);
    expect(blocks?.some((b) => b.text.includes("should not appear"))).toBe(false);
  });
});
