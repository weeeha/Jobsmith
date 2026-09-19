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
