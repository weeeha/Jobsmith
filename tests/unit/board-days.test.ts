import { describe, expect, it } from "vitest";
import { daysInStage } from "@/lib/board/days";

describe("daysInStage", () => {
  const now = new Date("2026-09-19T12:00:00.000Z");

  it("returns null when there is no entered date", () => {
    expect(daysInStage(null, now)).toBeNull();
  });

  it("returns 0 for the same day", () => {
    expect(daysInStage(new Date("2026-09-19T08:00:00.000Z"), now)).toBe(0);
  });

  it("returns 1 for exactly one day earlier", () => {
    expect(daysInStage(new Date("2026-09-18T12:00:00.000Z"), now)).toBe(1);
  });

  it("floors a partial day", () => {
    expect(daysInStage(new Date("2026-09-17T13:00:00.000Z"), now)).toBe(1);
  });

  it("never returns a negative number for a future entered date", () => {
    expect(daysInStage(new Date("2026-09-20T00:00:00.000Z"), now)).toBe(0);
  });
});
