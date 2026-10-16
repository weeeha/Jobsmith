import { describe, expect, it } from "vitest";
import { addZonedDays, isTimeZone, zonedAt, zonedDayStart } from "@/lib/time/zone";

describe("zonedAt", () => {
  it("places a wall-clock time in a named zone", () => {
    expect(zonedAt(2026, 10, 16, 9, 0, "America/New_York").toISOString()).toBe("2026-10-16T13:00:00.000Z");
    expect(zonedAt(2026, 1, 16, 9, 0, "America/New_York").toISOString()).toBe("2026-01-16T14:00:00.000Z");
    expect(zonedAt(2026, 10, 16, 9, 0, "UTC").toISOString()).toBe("2026-10-16T09:00:00.000Z");
    expect(zonedAt(2026, 10, 16, 9, 0, "Asia/Kolkata").toISOString()).toBe("2026-10-16T03:30:00.000Z");
  });

  it("lands on the right side of a daylight saving change", () => {
    // Clocks in Berlin go back at 03:00 on 25 October 2026.
    expect(zonedAt(2026, 10, 25, 9, 0, "Europe/Berlin").toISOString()).toBe("2026-10-25T08:00:00.000Z");
    expect(zonedAt(2026, 10, 24, 9, 0, "Europe/Berlin").toISOString()).toBe("2026-10-24T07:00:00.000Z");
  });

  it("rolls an out-of-range day into the next month", () => {
    expect(zonedAt(2026, 10, 32, 9, 0, "UTC").toISOString()).toBe("2026-11-01T09:00:00.000Z");
  });
});

describe("zonedDayStart", () => {
  it("is midnight of the zone's own calendar day, not the UTC one", () => {
    // 02:00 UTC on 16 October is still 15 October in New York.
    const now = new Date("2026-10-16T02:00:00.000Z");
    expect(zonedDayStart(now, "America/New_York").toISOString()).toBe("2026-10-15T04:00:00.000Z");
    expect(zonedDayStart(now, "UTC").toISOString()).toBe("2026-10-16T00:00:00.000Z");
  });
});

describe("addZonedDays", () => {
  it("returns 09:00 in the zone, the given number of calendar days later", () => {
    const now = new Date("2026-10-16T02:00:00.000Z");
    expect(addZonedDays(now, 1, "America/New_York").toISOString()).toBe("2026-10-16T13:00:00.000Z");
    expect(addZonedDays(now, 7, "UTC").toISOString()).toBe("2026-10-23T09:00:00.000Z");
  });

  it("keeps 09:00 across a daylight saving change", () => {
    const now = new Date("2026-10-23T10:00:00.000Z");
    expect(addZonedDays(now, 3, "Europe/Berlin").toISOString()).toBe("2026-10-26T08:00:00.000Z");
  });
});

describe("isTimeZone", () => {
  it("accepts IANA names and rejects anything else", () => {
    expect(isTimeZone("America/New_York")).toBe(true);
    expect(isTimeZone("UTC")).toBe(true);
    expect(isTimeZone("Mars/Olympus")).toBe(false);
    expect(isTimeZone("")).toBe(false);
  });
});
