import { describe, expect, it } from "vitest";
import { collapseRows } from "@/lib/compare/collapse";
import type { DiffRow } from "@/lib/compare/diff";

const units = (n: number, p = "u") => Array.from({ length: n }, (_, i) => `${p}${i}\n`);
const change = (id: number): DiffRow => ({
  type: "change",
  id,
  removed: ["a\n"],
  added: ["b\n"],
  words: null,
  wordsSkipped: true,
});
const none = new Set<string>();

describe("collapseRows", () => {
  it("a same run of 7 folds to 3 + folded(1 hidden) + 3; a run of 6 stays whole", () => {
    const out = collapseRows([change(1), { type: "same", units: units(7) }, change(2)], none);
    expect(out.map((r) => r.type)).toEqual(["change", "same", "folded", "same", "change"]);
    const folded = out[2];
    expect(folded.type === "folded" && folded.count).toBe(1);
    expect((out[1] as { units: string[] }).units).toHaveLength(3);
    expect((out[3] as { units: string[] }).units).toHaveLength(3);
    const whole = collapseRows([change(1), { type: "same", units: units(6) }, change(2)], none);
    expect(whole.map((r) => r.type)).toEqual(["change", "same", "change"]);
  });

  it("the first and last runs keep only their inner side's context", () => {
    const out = collapseRows(
      [{ type: "same", units: units(10, "a") }, change(1), { type: "same", units: units(10, "b") }],
      none,
    );
    expect(out.map((r) => r.type)).toEqual(["folded", "same", "change", "same", "folded"]);
    expect((out[1] as { units: string[] }).units).toEqual(units(10, "a").slice(7));
    expect((out[3] as { units: string[] }).units).toEqual(units(10, "b").slice(0, 3));
  });

  it("the folded row reads 14 hidden units and expanding by key returns them", () => {
    const rows: DiffRow[] = [change(1), { type: "same", units: units(20) }, change(2)];
    const out = collapseRows(rows, none);
    const folded = out.find((r) => r.type === "folded");
    expect(folded && folded.type === "folded" && folded.count).toBe(14);
    const key = folded!.type === "folded" ? folded!.key : "";
    const open = collapseRows(rows, new Set([key]));
    expect(open.map((r) => r.type)).toEqual(["change", "same", "change"]);
    expect((open[1] as { units: string[] }).units).toHaveLength(20);
  });
});
