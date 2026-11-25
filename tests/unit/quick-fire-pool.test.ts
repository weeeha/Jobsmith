import { describe, expect, it } from "vitest";
import { quickFirePool } from "@/lib/prep/quick-fire";

const row = (key: string, artifactKey: string, spine: string | null, n = 1) => ({
  questionKey: key,
  artifactKey,
  number: n,
  question: `Q ${key}`,
  spine,
});

describe("quickFirePool", () => {
  const rows = [
    row("a".repeat(16), "bank-1", "Shape A"),
    row("b".repeat(16), "bank-1", null),
    row("c".repeat(16), "bank-1", "   "),
    row("d".repeat(16), "bank-2", "Shape D"),
  ];

  it("keeps only rows with a non-blank spine", () => {
    expect(quickFirePool(rows, new Map(), null).map((q) => q.questionKey)).toEqual(["a".repeat(16), "d".repeat(16)]);
  });

  it("narrows to one bank when a key is given", () => {
    expect(quickFirePool(rows, new Map(), "bank-2").map((q) => q.questionKey)).toEqual(["d".repeat(16)]);
  });

  it("carries the current mark level", () => {
    const levels = new Map([["a".repeat(16), "solid" as const]]);
    const pool = quickFirePool(rows, levels, null);
    expect(pool[0].level).toBe("solid");
    expect(pool[1].level).toBeNull();
  });
});
