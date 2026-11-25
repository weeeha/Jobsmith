import { describe, expect, it } from "vitest";
import { drillGapSeconds, MORE_TIME_SECONDS, sayLength } from "@/lib/prep/gaps";
import type { ParsedBlock } from "@/lib/prep/parse";

describe("drillGapSeconds", () => {
  it("0 characters gives the 15 second floor", () => {
    expect(drillGapSeconds(0, 1)).toBe(15);
  });
  it("130 characters gives round(12) = 12, clamped up to 15", () => {
    expect(drillGapSeconds(130, 1)).toBe(15);
  });
  it("195 characters gives 18 seconds", () => {
    expect(drillGapSeconds(195, 1)).toBe(18);
  });
  it("1000 characters gives 92 seconds", () => {
    expect(drillGapSeconds(1000, 1)).toBe(92);
  });
  it("2000 characters gives the 120 second ceiling", () => {
    expect(drillGapSeconds(2000, 1)).toBe(120);
  });
  it("the gap factor multiplies after the clamp: 15 x 0.5 = 7.5 and 120 x 2 = 240", () => {
    expect(drillGapSeconds(0, 0.5)).toBe(7.5);
    expect(drillGapSeconds(5000, 2)).toBe(240);
  });
  it("MORE_TIME_SECONDS is 30", () => {
    expect(MORE_TIME_SECONDS).toBe(30);
  });
});

describe("sayLength", () => {
  const say: ParsedBlock = { label: "Say", spoken: true, text: "Hello there" };
  const other: ParsedBlock = { label: "Long version", spoken: true, text: "A longer answer here" };
  const note: ParsedBlock = { label: "Spine", spoken: false, text: "Private note text" };

  it("uses the Say block, falls back to the first spoken block and returns 0 for none", () => {
    expect(sayLength([other, say])).toBe("Hello there".length);
    expect(sayLength([note, other])).toBe("A longer answer here".length);
    expect(sayLength([note])).toBe(0);
    expect(sayLength([])).toBe(0);
  });
  it("matches the Say label with a colon or other case", () => {
    expect(sayLength([other, { ...say, label: "say:" }])).toBe("Hello there".length);
  });
  it("measures the spoken text, not the markdown", () => {
    expect(sayLength([{ label: "Say", spoken: true, text: "**Bold** and [a link](https://example.com)" }])).toBe("Bold and a link".length);
  });
});
