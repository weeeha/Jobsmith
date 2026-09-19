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
    const commentOnly = [
      "// mentions rgb(0,0,0), hsl(0,0%,0%) and #ff0000 but is only a comment",
      "/* also only a comment, mentioning bg-zinc-100 */",
      "* continuation of a block comment mentioning oklch(0.5 0 0)",
      "{/* JSX comment mentioning rgb(1,2,3) */}",
    ].join("\n");
    expect(findViolations("inline.tsx", commentOnly)).toEqual([]);
  });

  it("still scans a code line in full even when it carries a trailing comment", () => {
    const codeWithTrailingComment = "const x = 1; // still flags rgb(0,0,0) in a trailing comment";
    const violations = findViolations("inline.tsx", codeWithTrailingComment);
    expect(violations.some((v) => v.rule === "raw-color-function" && v.text.includes("rgb("))).toBe(
      true,
    );
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

  it("still flags compound arbitrary values and trailing-comment violations in bad-edge-cases", () => {
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
    expect(
      violations.some((v) => v.rule === "raw-color-function" && v.text.includes("rgb(")),
    ).toBe(true);
  });
});
