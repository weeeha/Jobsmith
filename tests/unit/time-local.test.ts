import { describe, expect, it } from "vitest";
import { toInstant, toLocalInputValue } from "@/lib/time/local";

describe("toInstant", () => {
  it("converts a datetime-local value in the runtime zone to an ISO instant", () => {
    expect(toInstant("2026-10-01T09:30")).toBe(new Date("2026-10-01T09:30").toISOString());
  });

  it("passes an empty string through unchanged", () => {
    expect(toInstant("")).toBe("");
  });
});

describe("toLocalInputValue", () => {
  it("converts an ISO instant back to a datetime-local value in the runtime zone", () => {
    const iso = new Date("2026-10-01T09:30").toISOString();
    expect(toLocalInputValue(iso)).toBe("2026-10-01T09:30");
  });

  it("passes an empty string through unchanged", () => {
    expect(toLocalInputValue("")).toBe("");
  });

  it("round-trips through toInstant", () => {
    const original = "2026-01-05T00:15";
    expect(toLocalInputValue(toInstant(original))).toBe(original);
  });
});
