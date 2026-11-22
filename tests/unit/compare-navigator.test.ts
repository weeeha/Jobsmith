import { describe, expect, it } from "vitest";
import { changeLabel, nextIndex, restingLabel } from "@/lib/compare/navigator";

describe("compare navigator helpers", () => {
  it("changeLabel is 1 based in text", () => {
    expect(changeLabel(2, 12)).toBe("Change 3 of 12");
    expect(changeLabel(0, 1)).toBe("Change 1 of 1");
    expect(changeLabel(-1, 0)).toBe("No changes");
  });
  it("restingLabel pluralises", () => {
    expect(restingLabel(12)).toBe("12 changes");
    expect(restingLabel(1)).toBe("1 change");
    expect(restingLabel(0)).toBe("No changes");
  });
  it("nextIndex stops at the ends", () => {
    expect(nextIndex(-1, 3, "next")).toBe(0);
    expect(nextIndex(2, 3, "next")).toBe(2);
    expect(nextIndex(0, 3, "previous")).toBe(0);
    expect(nextIndex(2, 3, "previous")).toBe(1);
    expect(nextIndex(-1, 3, "previous")).toBe(-1);
    expect(nextIndex(-1, 0, "next")).toBe(-1);
  });
});
