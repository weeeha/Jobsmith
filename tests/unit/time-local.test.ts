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

describe("toInstant with a zone", () => {
  it("reads the value as wall-clock time in that zone", () => {
    expect(toInstant("2026-10-01T09:30", "Europe/Amsterdam")).toBe("2026-10-01T07:30:00.000Z");
    expect(toInstant("2026-10-01T09:30", "Asia/Tokyo")).toBe("2026-10-01T00:30:00.000Z");
  });

  it("moves a time skipped by daylight saving later by the gap", () => {
    expect(toInstant("2026-03-08T02:30", "America/New_York")).toBe("2026-03-08T07:30:00.000Z");
  });

  it("takes the earlier instant of a repeated time", () => {
    expect(toInstant("2026-11-01T01:30", "America/New_York")).toBe("2026-11-01T05:30:00.000Z");
  });

  it("gives an empty string for an empty or unreadable value", () => {
    expect(toInstant("", "Asia/Tokyo")).toBe("");
    expect(toInstant("tomorrow", "Asia/Tokyo")).toBe("");
    expect(toInstant("2026-02-30T10:00", "Asia/Tokyo")).toBe("");
  });

  it("behaves as before with a null zone", () => {
    expect(toInstant("2026-10-01T09:30", null)).toBe(new Date("2026-10-01T09:30").toISOString());
  });
});

describe("toLocalInputValue with a zone", () => {
  it("shows the instant as wall-clock time in that zone", () => {
    expect(toLocalInputValue("2026-10-01T07:30:00.000Z", "Europe/Amsterdam")).toBe("2026-10-01T09:30");
    expect(toLocalInputValue("2026-10-01T20:30:00.000Z", "Asia/Tokyo")).toBe("2026-10-02T05:30");
  });

  it("gives an empty string for an empty value", () => {
    expect(toLocalInputValue("", "Asia/Tokyo")).toBe("");
  });

  it("round-trips through toInstant", () => {
    expect(toLocalInputValue(toInstant("2026-01-05T00:15", "America/New_York"), "America/New_York")).toBe("2026-01-05T00:15");
  });
});
