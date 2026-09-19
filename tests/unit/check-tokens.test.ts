import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { findViolations } from "../../scripts/check-tokens.mjs";

const fixture = (name: string) =>
  readFileSync(path.join(__dirname, "../fixtures/check-tokens", name), "utf8");

describe("findViolations", () => {
  it("flags raw hex colors", () => {
    const violations = findViolations("bad.tsx", fixture("bad.tsx"));
    expect(violations.some((v) => v.rule === "raw-hex-color")).toBe(true);
  });

  it("flags oklch/rgb/hsl functions", () => {
    const violations = findViolations("bad.tsx", fixture("bad.tsx"));
    expect(
      violations.some((v) => v.rule === "raw-color-function" && v.text.includes("oklch(")),
    ).toBe(true);
    expect(
      violations.some((v) => v.rule === "raw-color-function" && v.text.includes("rgb(")),
    ).toBe(true);
    expect(
      violations.some((v) => v.rule === "raw-color-function" && v.text.includes("hsl(")),
    ).toBe(true);
  });

  it("flags Tailwind palette classes", () => {
    const violations = findViolations("bad.tsx", fixture("bad.tsx"));
    expect(
      violations.some((v) => v.rule === "tailwind-palette-class" && v.text.includes("bg-zinc-100")),
    ).toBe(true);
    expect(
      violations.some((v) => v.rule === "tailwind-palette-class" && v.text.includes("text-slate-500")),
    ).toBe(true);
  });

  it("flags arbitrary values", () => {
    const violations = findViolations("bad.tsx", fixture("bad.tsx"));
    expect(violations.some((v) => v.rule === "arbitrary-value" && v.text === "rounded-[14px]")).toBe(
      true,
    );
    expect(
      violations.some((v) => v.rule === "arbitrary-value" && v.text === "duration-[250ms]"),
    ).toBe(true);
  });

  it("passes semantic utilities, motion tokens and data-attribute/arbitrary-selector variants", () => {
    const violations = findViolations("clean.tsx", fixture("clean.tsx"));
    expect(violations).toEqual([]);
  });
});

describe("findViolations - review fix round 1", () => {
  it("allows an arbitrary value that is only a var() reference, but flags a compound one", () => {
    const line =
      '<div className="text-[var(--brand-accent)] text-[var(--brand-accent)_solid] text-[calc(var(--brand-accent)+2px)]" />';
    const violations = findViolations("inline.tsx", line);
    expect(violations).toHaveLength(2);
    expect(violations.map((v) => v.text)).toEqual([
      "text-[var(--brand-accent)_solid]",
      "text-[calc(var(--brand-accent)+2px)]",
    ]);
  });

  it("does not scan a line that is only a comment", () => {
    // Note (review fix round 3): element 3 used to be a standalone line
    // starting with "*", tested in isolation, which round 2's per-line
    // heuristic treated as a block-comment continuation regardless of
    // context. Round 3 tracks real state instead, so a bare "*" line only
    // reads as a continuation when it is genuinely inside a still-open
    // block comment; here that means the "/* ..." on the previous line
    // must stay open (no longer close on its own) and this line supplies
    // the actual closing marker, which is the only way to keep this test
    // meaningful under a real scanner instead of accidentally depending on
    // round 2's now-removed, less precise heuristic.
    const commentOnly = [
      "// mentions rgb(0,0,0), hsl(0,0%,0%) and #ff0000 but is only a comment",
      "/* also only a comment, mentioning bg-zinc-100",
      " * continuation of that block comment mentioning oklch(0.5 0 0) */",
      "{/* JSX comment mentioning rgb(1,2,3) */}",
    ].join("\n");
    expect(findViolations("inline.tsx", commentOnly)).toEqual([]);
  });

  it("still scans the code on a line that also carries a trailing comment", () => {
    // Note (review fix round 3): this used to assert that a violation
    // WRITTEN INSIDE the trailing "// comment" text was still reported,
    // because round 2 never stripped a trailing "//" that did not start
    // the trimmed line. Round 3's real scanner treats "//" as starting a
    // line comment wherever it appears in `code` state, so a genuine
    // trailing comment is now correctly blanked like any other comment;
    // what round 3's own spec requires instead is that the CODE ahead of
    // that comment is still scanned in full, which is what this now checks.
    const codeWithTrailingComment = 'const bg = "#ff0000"; // a harmless trailing comment';
    const violations = findViolations("inline.tsx", codeWithTrailingComment);
    expect(violations.some((v) => v.rule === "raw-hex-color" && v.text === "#ff0000")).toBe(true);
  });

  it("suppresses only the single line after a check-tokens-ignore-next-line comment", () => {
    const suppressed = [
      "// check-tokens-ignore-next-line: test double for an anchor fragment",
      '<a href="#face">jump</a>',
      '<a href="#face">jump again, not suppressed</a>',
    ].join("\n");
    const violations = findViolations("inline.tsx", suppressed);
    expect(violations).toHaveLength(1);
    expect(violations[0]).toMatchObject({ line: 3, rule: "raw-hex-color", text: "#face" });
  });

  it("passes the composite clean-edge-cases fixture: var() refs, comments and a suppressed false positive", () => {
    const violations = findViolations("clean-edge-cases.tsx", fixture("clean-edge-cases.tsx"));
    expect(violations).toEqual([]);
  });

  it("still flags compound arbitrary values in bad-edge-cases, and the code on its trailing-comment line", () => {
    // Note (review fix round 3): the fixture's trailing-comment line used
    // to put its own violation INSIDE the "// ..." text, matching round
    // 2's (now-corrected) behavior of never stripping a trailing "//".
    // The fixture now puts that line's violation in the CODE ahead of the
    // comment instead, and this asserts a raw-hex-color rather than the
    // old raw-color-function, since that is what the updated fixture
    // actually contains.
    const violations = findViolations("bad-edge-cases.tsx", fixture("bad-edge-cases.tsx"));
    expect(
      violations.some(
        (v) => v.rule === "arbitrary-value" && v.text === "text-[var(--brand-accent)_solid]",
      ),
    ).toBe(true);
    expect(
      violations.some(
        (v) => v.rule === "arbitrary-value" && v.text === "text-[calc(var(--brand-accent)+2px)]",
      ),
    ).toBe(true);
    expect(violations.some((v) => v.rule === "raw-hex-color" && v.text === "#ff0000")).toBe(true);
  });
});

describe("findViolations - review fix round 2", () => {
  it("scans the code that follows a same-line JSX comment", () => {
    const line = '{/* eslint-disable-next-line */} <div className="bg-red-500" />';
    const violations = findViolations("inline.tsx", line);
    expect(
      violations.some((v) => v.rule === "tailwind-palette-class" && v.text === "bg-red-500"),
    ).toBe(true);
  });

  it("scans the code that follows a same-line block comment", () => {
    const line = '/* comment */ const bg = "#ff0000";';
    const violations = findViolations("inline.tsx", line);
    expect(violations.some((v) => v.rule === "raw-hex-color" && v.text === "#ff0000")).toBe(true);
  });

  it("scans the code that follows a block-comment closer on a continuation line", () => {
    const line = '*/ const bg = "#ff0000";';
    const violations = findViolations("inline.tsx", line);
    expect(violations.some((v) => v.rule === "raw-hex-color" && v.text === "#ff0000")).toBe(true);
  });

  it("still reports nothing for a pure comment line mentioning rgb() or a palette class", () => {
    const lines = [
      "// mentions rgb(0,0,0) but is only a comment",
      "// also only a comment, mentioning bg-zinc-100",
    ].join("\n");
    expect(findViolations("inline.tsx", lines)).toEqual([]);
  });

  it("still scans a code line with a trailing comment in full, reporting a violation in the code", () => {
    const line = '<div className="bg-red-500" /> // nothing unusual in this trailing comment';
    const violations = findViolations("inline.tsx", line);
    expect(
      violations.some((v) => v.rule === "tailwind-palette-class" && v.text === "bg-red-500"),
    ).toBe(true);
  });

  it("keeps line numbers correct across a stripped multi-line block comment", () => {
    const source = [
      "/**",
      " * Mentions rgb(0, 0, 0) here, still only a comment.",
      " */",
      'const bg = "#ff0000";',
    ].join("\n");
    const violations = findViolations("inline.tsx", source);
    expect(violations).toHaveLength(1);
    expect(violations[0]).toMatchObject({ line: 4, rule: "raw-hex-color", text: "#ff0000" });
  });
});

describe("findViolations - review fix round 3", () => {
  it("does not delete a comment-shaped violation that is actually a string's own contents (JS comment punctuation)", () => {
    const line = 'const bg = "/* #ff0000 */";';
    const violations = findViolations("inline.tsx", line);
    expect(violations).toHaveLength(1);
    expect(violations[0]).toMatchObject({ rule: "raw-hex-color", text: "#ff0000" });
  });

  it("does not delete a comment-shaped violation that is actually a string's own contents (JSX comment punctuation)", () => {
    const line = 'const bg = "{/* #ff0000 */}";';
    const violations = findViolations("inline.tsx", line);
    expect(violations).toHaveLength(1);
    expect(violations[0]).toMatchObject({ rule: "raw-hex-color", text: "#ff0000" });
  });

  it("does not mistake // inside a string (a URL) for the start of a line comment", () => {
    const line = 'const url = "https://example.com/path"; const bg = "#ff0000";';
    const violations = findViolations("inline.tsx", line);
    expect(violations).toHaveLength(1);
    expect(violations[0]).toMatchObject({ rule: "raw-hex-color", text: "#ff0000" });
  });

  it("scans code before AND after a same-line block comment on one line", () => {
    const line = 'const a = 1; /* note */ const bg = "#ff0000";';
    const violations = findViolations("inline.tsx", line);
    expect(violations).toHaveLength(1);
    expect(violations[0]).toMatchObject({ rule: "raw-hex-color", text: "#ff0000" });
  });

  it("reports nothing for a multi-line block comment whose inner lines have no leading *, and reports the violation after it closes with the correct line number", () => {
    const source = [
      "/*",
      "rgb(0,0,0) and bg-zinc-100 mentioned here, with no leading star",
      "*/",
      'const bg = "#ff0000";',
    ].join("\n");
    const violations = findViolations("inline.tsx", source);
    expect(violations).toHaveLength(1);
    expect(violations[0]).toMatchObject({ line: 4, rule: "raw-hex-color", text: "#ff0000" });
  });

  it("scans a template literal spanning two lines and reports a violation on its second line with the correct line number", () => {
    const source = ["const cls = `", "  bg-red-500", "`;"].join("\n");
    const violations = findViolations("inline.tsx", source);
    expect(violations).toHaveLength(1);
    expect(violations[0]).toMatchObject({ line: 2, rule: "tailwind-palette-class", text: "bg-red-500" });
  });
});
