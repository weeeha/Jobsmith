import { describe, expect, it } from "vitest";
import { homeLine, summarize, summaryLine } from "@/lib/prep/summary";
import type { MarkLevel } from "@/lib/prep/values";

const levels = (entries: [string, MarkLevel][]) => new Map<string, MarkLevel>(entries);

describe("confidence summary", () => {
  it("summarize counts solid, okay, shaky and unmarked per question key; the four add up to total", () => {
    const keys = ["a", "b", "c", "d", "e", "f"];
    const c = summarize(keys, levels([["a", "solid"], ["b", "solid"], ["c", "okay"], ["d", "shaky"]]));
    expect(c).toEqual({ solid: 2, okay: 1, shaky: 1, unmarked: 2, total: 6 });
    expect(c.solid + c.okay + c.shaky + c.unmarked).toBe(c.total);
  });

  it("ignores marks for keys that are not in the list", () => {
    const c = summarize(["a"], levels([["zzz", "solid"]]));
    expect(c).toEqual({ solid: 0, okay: 0, shaky: 0, unmarked: 1, total: 1 });
  });

  it("summaryLine reads '12 solid · 6 okay · 4 shaky · 8 unmarked'", () => {
    expect(summaryLine({ solid: 12, okay: 6, shaky: 4, unmarked: 8, total: 30 })).toBe(
      "12 solid · 6 okay · 4 shaky · 8 unmarked",
    );
  });

  it("homeLine reads '12 of 30 solid'", () => {
    expect(homeLine({ solid: 12, okay: 6, shaky: 4, unmarked: 8, total: 30 })).toBe("12 of 30 solid");
  });

  it("a question key listed twice counts twice", () => {
    const c = summarize(["a", "a", "b"], levels([["a", "solid"]]));
    expect(c).toEqual({ solid: 2, okay: 0, shaky: 0, unmarked: 1, total: 3 });
  });
});
