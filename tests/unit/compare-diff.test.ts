import { describe, expect, it } from "vitest";
import { diffUnits, sectionOf, type DiffRow } from "@/lib/compare/diff";
import { unitsForDiff } from "@/lib/compare/units";

function ok(a: string[], b: string[], limits?: Parameters<typeof diffUnits>[2]) {
  const r = diffUnits(a, b, limits);
  if (!r.ok) throw new Error("expected ok");
  return r;
}
const changes = (rows: DiffRow[]) =>
  rows.filter((r): r is Extract<DiffRow, { type: "change" }> => r.type === "change");

describe("diffUnits", () => {
  it("identical lists give one same row and zero changes", () => {
    const r = ok(["a\n", "b\n"], ["a\n", "b\n"]);
    expect(r.rows).toEqual([{ type: "same", units: ["a\n", "b\n"] }]);
    expect(r.changeCount).toBe(0);
    expect(r.summary).toEqual({ wordsAdded: 0, wordsRemoved: 0, sectionsChanged: 0 });
  });

  it("a removed run followed by an added run is one change row; ids count up from 1", () => {
    const r = ok(["a\n", "b\n", "c\n", "d\n", "e\n"], ["a\n", "X\n", "Y\n", "c\n", "Z\n"]);
    const c = changes(r.rows);
    expect(c.map((x) => x.id)).toEqual([1, 2]);
    expect(c[0].removed).toEqual(["b\n"]);
    expect(c[0].added).toEqual(["X\n", "Y\n"]);
    expect(r.changeCount).toBe(2);
  });

  it("a pure insertion and a pure deletion are change rows with one empty side", () => {
    const ins = changes(ok(["a\n"], ["a\n", "b\n"]).rows)[0];
    expect(ins.removed).toEqual([]);
    expect(ins.added).toEqual(["b\n"]);
    const del = changes(ok(["a\n", "b\n"], ["a\n"]).rows)[0];
    expect(del.added).toEqual([]);
    expect(del.removed).toEqual(["b\n"]);
  });

  it("word marks keep whitespace and mark only the inserted words", () => {
    const r = ok(["Led design for payments."], ["Led design for checkout and payments."]);
    const c = changes(r.rows)[0];
    expect(c.wordsSkipped).toBe(false);
    expect(c.words!.left.some((p) => p.kind === "removed")).toBe(false);
    expect(c.words!.right.filter((p) => p.kind === "added").map((p) => p.text).join("")).toBe("checkout and ");
    expect(c.words!.right.map((p) => p.text).join("")).toBe("Led design for checkout and payments.");
    expect(c.words!.left.map((p) => p.text).join("")).toBe("Led design for payments.");
  });

  it("words are counted from the word diff", () => {
    const r = ok(["Led design for payments."], ["Led design for checkout and payments."]);
    expect(r.summary.wordsAdded).toBe(2);
    expect(r.summary.wordsRemoved).toBe(0);
  });

  it("a side over 20000 characters skips word marks and counts whole units", () => {
    const big = "word ".repeat(4001); // 20005 chars
    const r = ok([big], ["small one"]);
    const c = changes(r.rows)[0];
    expect(c.words).toBeNull();
    expect(c.wordsSkipped).toBe(true);
    expect(r.summary.wordsRemoved).toBe(4001);
    expect(r.summary.wordsAdded).toBe(2);
  });

  it("a word diff timeout falls back the same way", () => {
    const left = Array.from({ length: 3000 }, (_, i) => `a${i}`).join(" ");
    const right = Array.from({ length: 3000 }, (_, i) => `b${i}`).join(" ");
    const r = ok([left], [right], { wordMarkTimeoutMs: 0 });
    const c = changes(r.rows)[0];
    expect(c.words).toBeNull();
    expect(c.wordsSkipped).toBe(true);
    expect(r.summary).toMatchObject({ wordsRemoved: 3000, wordsAdded: 3000 });
  });

  it("past maxEditLength the result is too_different", () => {
    const a = ["1\n", "2\n", "3\n", "4\n", "5\n", "6\n"];
    const b = ["a\n", "b\n", "c\n", "d\n", "e\n", "f\n"];
    expect(diffUnits(a, b, { maxEditLength: 3 })).toEqual({ ok: false, reason: "too_different" });
  });

  it("sectionsChanged counts distinct headings above changes", () => {
    const a = ["intro\n", "## A\n", "a1\n", "a2\n", "## B\n", "b1\n"];
    const b = ["intro!\n", "## A\n", "a1!\n", "a2\n", "x\n", "## B\n", "b1\n"];
    // changes: intro (before any heading), a1 under A, x under A
    const r = ok(a, b);
    expect(r.changeCount).toBe(3);
    expect(r.summary.sectionsChanged).toBe(2);
  });

  it("a removed unit that held the heading counts under that heading", () => {
    const a = ["## A\n", "a1\n", "## B\n", "b1\n"];
    const b = ["## A\n", "a1\n", "b1\n"];
    const r = ok(a, b);
    expect(r.changeCount).toBe(1);
    expect(r.summary.sectionsChanged).toBe(1);
    expect(sectionOf(r.rows, r.rows.findIndex((x) => x.type === "change"))).toBe("## B");
  });

  it("sectionOf returns the nearest heading, empty before the first", () => {
    const r = ok(["x\n", "## A\n", "y\n"], ["x2\n", "## A\n", "y\n"]);
    expect(sectionOf(r.rows, 0)).toBe("");
    expect(sectionOf(r.rows, r.rows.length - 1)).toBe("## A");
  });

  it("change sides joined give back the old and new text", () => {
    const oldText = "Intro line one. Second sentence here.\n## Work\nBuilt things.\nShipped it.";
    const newText = "Intro line one. A new second sentence.\n## Work\nBuilt many things.\nShipped it.\nMore.";
    const a = unitsForDiff(oldText);
    const b = unitsForDiff(newText);
    const r = ok(a, b);
    const left = r.rows.map((x) => (x.type === "same" ? x.units : x.removed)).flat().join("");
    const right = r.rows.map((x) => (x.type === "same" ? x.units : x.added)).flat().join("");
    expect(left).toBe(a.join(""));
    expect(right).toBe(b.join(""));
    for (const c of changes(r.rows)) {
      if (c.words) {
        expect(c.words.left.map((p) => p.text).join("")).toBe(c.removed.join(""));
        expect(c.words.right.map((p) => p.text).join("")).toBe(c.added.join(""));
      }
    }
  });
});
