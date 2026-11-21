import { describe, expect, it } from "vitest";
import { orderForDrill, type DrillCandidate } from "@/lib/prep/order";
import type { MarkLevel } from "@/lib/prep/values";

const T = (day: number) => new Date(Date.UTC(2026, 10, day, 12));

function cand(key: string, over: Partial<DrillCandidate> = {}): DrillCandidate {
  return { questionKey: key, position: 0, section: null, hasAnswer: true, level: null, lastDrilledAt: null, ...over };
}
const keys = (list: DrillCandidate[]) => list.map((c) => c.questionKey);

describe("orderForDrill", () => {
  it("orders shaky, then okay, then unmarked, then solid", () => {
    const levels: (MarkLevel | null)[] = ["solid", null, "okay", "shaky"];
    const list = levels.map((level, i) => cand(`k${i}`, { level, position: i }));
    expect(keys(orderForDrill(list, {}))).toEqual(["k3", "k2", "k1", "k0"]);
  });

  it("inside a level, never-drilled comes first, then the oldest lastDrilledAt, then position", () => {
    const list = [
      cand("recent", { level: "shaky", lastDrilledAt: T(20), position: 0 }),
      cand("old", { level: "shaky", lastDrilledAt: T(10), position: 1 }),
      cand("never-late", { level: "shaky", lastDrilledAt: null, position: 5 }),
      cand("never-early", { level: "shaky", lastDrilledAt: null, position: 2 }),
    ];
    expect(keys(orderForDrill(list, {}))).toEqual(["never-early", "never-late", "old", "recent"]);
  });

  it("drops questions with no answer", () => {
    const list = [cand("a", { hasAnswer: false }), cand("b")];
    expect(keys(orderForDrill(list, {}))).toEqual(["b"]);
  });

  it("never repeats a question key that appears twice in a bank", () => {
    const list = [cand("dup", { level: "solid", position: 0 }), cand("dup", { level: "solid", position: 1 }), cand("x", { level: "solid", position: 2 })];
    const out = orderForDrill(list, {});
    expect(keys(out)).toEqual(["dup", "x"]);
    expect(out[0].position).toBe(0);
  });

  it("takes ten by default and the given count otherwise", () => {
    const list = Array.from({ length: 15 }, (_, i) => cand(`k${i}`, { position: i }));
    expect(orderForDrill(list, {})).toHaveLength(10);
    expect(orderForDrill(list, { count: 4 })).toHaveLength(4);
    expect(orderForDrill(list, { count: 40 })).toHaveLength(15);
  });

  it("a section drill returns every answered question of that section and ignores count", () => {
    const list = [
      ...Array.from({ length: 12 }, (_, i) => cand(`a${i}`, { section: "Opening", position: i })),
      cand("b", { section: "Other", position: 20 }),
      cand("noans", { section: "Opening", position: 30, hasAnswer: false }),
    ];
    const out = orderForDrill(list, { section: "Opening", count: 3 });
    expect(out).toHaveLength(12);
    expect(out.every((c) => c.section === "Opening")).toBe(true);
  });

  it("onlyShaky keeps just the shaky ones", () => {
    const list = [cand("a", { level: "shaky" }), cand("b", { level: "okay" }), cand("c", { level: null }), cand("d", { level: "shaky", position: 3 })];
    expect(keys(orderForDrill(list, { onlyShaky: true }))).toEqual(["a", "d"]);
  });

  it("is stable: the same input gives the same order", () => {
    const list = Array.from({ length: 8 }, (_, i) => cand(`k${i}`, { level: i % 2 ? "okay" : null, position: i % 3, lastDrilledAt: i % 4 ? T(i + 1) : null }));
    const first = keys(orderForDrill(list, {}));
    expect(keys(orderForDrill([...list], {}))).toEqual(first);
    expect(keys(orderForDrill([...list].reverse(), {})).sort()).toEqual([...first].sort());
  });
});
