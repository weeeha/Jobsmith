import { describe, expect, it } from "vitest";
import {
  atTimeDaysLater,
  calendarDaysBetween,
  canonicalTimeZone,
  formatLocalInputValue,
  instantFromWallClock,
  listTimeZones,
  parseLocalInputValue,
  startOfDayIn,
  wallClockIn,
  zonedDateKey,
} from "@/lib/time/zone";

function wall(value: string) {
  const parsed = parseLocalInputValue(value);
  if (!parsed) throw new Error(`bad test value ${value}`);
  return parsed;
}
const iso = (date: Date) => date.toISOString();
const shown = (instant: Date, zone: string) => formatLocalInputValue(wallClockIn(instant, zone));

describe("instantFromWallClock: ordinary times", () => {
  it.each([
    ["Europe/Amsterdam", "2026-07-01T09:30", "2026-07-01T07:30:00.000Z"],
    ["Europe/Amsterdam", "2026-01-15T09:30", "2026-01-15T08:30:00.000Z"],
    ["America/New_York", "2026-10-11T18:00", "2026-10-11T22:00:00.000Z"],
    ["Asia/Kolkata", "2026-10-11T09:00", "2026-10-11T03:30:00.000Z"],
    ["Asia/Kathmandu", "2026-10-11T09:00", "2026-10-11T03:15:00.000Z"],
    ["America/St_Johns", "2026-07-01T09:00", "2026-07-01T11:30:00.000Z"],
    ["UTC", "2026-10-11T09:00", "2026-10-11T09:00:00.000Z"],
    ["Asia/Tokyo", "2026-10-12T00:00", "2026-10-11T15:00:00.000Z"],
  ])("%s %s is %s", (zone, local, expected) => {
    expect(iso(instantFromWallClock(wall(local), zone))).toBe(expected);
  });
});

describe("instantFromWallClock: clocks going forward (a skipped time moves later by the gap)", () => {
  it("Amsterdam 02:30 on 2026-03-29 becomes 03:30 local, 01:30Z", () => {
    const instant = instantFromWallClock(wall("2026-03-29T02:30"), "Europe/Amsterdam");
    expect(iso(instant)).toBe("2026-03-29T01:30:00.000Z");
    expect(shown(instant, "Europe/Amsterdam")).toBe("2026-03-29T03:30");
  });

  it("New York 02:30 on 2026-03-08 becomes 07:30Z", () => {
    expect(iso(instantFromWallClock(wall("2026-03-08T02:30"), "America/New_York"))).toBe("2026-03-08T07:30:00.000Z");
  });

  it("Lord Howe moves by 30 minutes: 02:15 on 2026-10-04 becomes 02:45 local", () => {
    const instant = instantFromWallClock(wall("2026-10-04T02:15"), "Australia/Lord_Howe");
    expect(shown(instant, "Australia/Lord_Howe")).toBe("2026-10-04T02:45");
  });
});

describe("instantFromWallClock: clocks going back (a repeated time is the earlier instant)", () => {
  it("Amsterdam 02:30 on 2026-10-25 is 00:30Z, not 01:30Z", () => {
    expect(iso(instantFromWallClock(wall("2026-10-25T02:30"), "Europe/Amsterdam"))).toBe("2026-10-25T00:30:00.000Z");
  });

  it("New York 01:30 on 2026-11-01 is 05:30Z, not 06:30Z", () => {
    expect(iso(instantFromWallClock(wall("2026-11-01T01:30"), "America/New_York"))).toBe("2026-11-01T05:30:00.000Z");
  });
});

describe("wall clock round trips", () => {
  it.each(["Europe/Amsterdam", "America/New_York", "Australia/Sydney", "Asia/Kolkata", "America/Santiago"])(
    "%s: every instant maps back to the same wall clock across a DST week",
    (zone) => {
      let checked = 0;
      // Steps of 17 minutes cross both the ordinary hours and the gap/overlap
      // hours of the late-March change in the northern zones.
      for (let t = Date.UTC(2026, 2, 25); t < Date.UTC(2026, 3, 8); t += 17 * 60_000) {
        const instant = new Date(Math.floor(t / 60_000) * 60_000);
        const w = wallClockIn(instant, zone);
        const back = instantFromWallClock(w, zone);
        // In an overlap the earlier instant wins, so only the wall clock must match.
        expect(wallClockIn(back, zone)).toEqual(w);
        checked++;
      }
      expect(checked).toBeGreaterThan(1000);
    },
  );
});

describe("startOfDayIn", () => {
  it("Amsterdam, evening in UTC but still the same local day", () => {
    expect(iso(startOfDayIn(new Date("2026-10-11T21:30:00Z"), "Europe/Amsterdam"))).toBe("2026-10-10T22:00:00.000Z");
  });

  it("Amsterdam, just past local midnight", () => {
    expect(iso(startOfDayIn(new Date("2026-10-11T22:30:00Z"), "Europe/Amsterdam"))).toBe("2026-10-11T22:00:00.000Z");
  });

  it("Los Angeles", () => {
    expect(iso(startOfDayIn(new Date("2026-10-11T05:00:00Z"), "America/Los_Angeles"))).toBe("2026-10-10T07:00:00.000Z");
  });

  it("Santiago, whose midnight does not exist on 2026-09-06, starts at 01:00", () => {
    const start = startOfDayIn(new Date("2026-09-06T15:00:00Z"), "America/Santiago");
    expect(shown(start, "America/Santiago")).toBe("2026-09-06T01:00");
  });

  it("Amsterdam on the day clocks go back (25 hours long)", () => {
    expect(iso(startOfDayIn(new Date("2026-10-25T12:00:00Z"), "Europe/Amsterdam"))).toBe("2026-10-24T22:00:00.000Z");
  });
});

describe("calendarDaysBetween", () => {
  it("is 0 on the same local day", () => {
    expect(calendarDaysBetween(new Date("2026-10-11T00:30:00Z"), new Date("2026-10-11T21:00:00Z"), "Europe/Amsterdam")).toBe(0);
  });

  it("counts a local midnight even when only two hours pass", () => {
    expect(calendarDaysBetween(new Date("2026-10-11T21:00:00Z"), new Date("2026-10-11T23:00:00Z"), "Europe/Amsterdam")).toBe(1);
  });

  it("counts seven days across the end of daylight saving time", () => {
    expect(calendarDaysBetween(new Date("2026-10-20T10:00:00Z"), new Date("2026-10-27T10:00:00Z"), "Europe/Amsterdam")).toBe(7);
  });
});

describe("atTimeDaysLater", () => {
  it("tomorrow 09:00 in Amsterdam when clocks go back that night", () => {
    expect(iso(atTimeDaysLater(new Date("2026-10-24T20:00:00Z"), "Europe/Amsterdam", 1, 9, 0))).toBe("2026-10-25T08:00:00.000Z");
  });

  it("in seven days at 09:00 in New York across the end of daylight saving time", () => {
    expect(iso(atTimeDaysLater(new Date("2026-10-30T23:00:00Z"), "America/New_York", 7, 9, 0))).toBe("2026-11-06T14:00:00.000Z");
  });

  it("zero days later at midnight is the start of the day after the given local date", () => {
    expect(iso(atTimeDaysLater(new Date("2026-10-11T20:30:00Z"), "Europe/Amsterdam", 1, 0, 0))).toBe("2026-10-11T22:00:00.000Z");
  });
});

describe("parseLocalInputValue and formatLocalInputValue", () => {
  it("parses a datetime-local value", () => {
    expect(parseLocalInputValue("2026-10-11T09:05")).toEqual({ year: 2026, month: 10, day: 11, hour: 9, minute: 5 });
  });

  it.each([
    ["a day that does not exist", "2026-02-30T10:00"],
    ["month 13", "2026-13-01T10:00"],
    ["hour 24", "2026-02-03T24:00"],
    ["seconds", "2026-02-03T10:00:00"],
    ["a space instead of T", "2026-02-03 10:00"],
    ["an empty string", ""],
  ])("rejects %s", (_name, value) => {
    expect(parseLocalInputValue(value)).toBeNull();
  });

  it("accepts 29 February in a leap year only", () => {
    expect(parseLocalInputValue("2028-02-29T10:00")).not.toBeNull();
    expect(parseLocalInputValue("2026-02-29T10:00")).toBeNull();
  });

  it("formats with zero padding", () => {
    expect(formatLocalInputValue({ year: 2026, month: 3, day: 4, hour: 5, minute: 6 })).toBe("2026-03-04T05:06");
  });
});

describe("zonedDateKey", () => {
  it("is the calendar date in the zone", () => {
    const instant = new Date("2026-10-11T22:30:00Z");
    expect(zonedDateKey(instant, "UTC")).toBe("2026-10-11");
    expect(zonedDateKey(instant, "Europe/Amsterdam")).toBe("2026-10-12");
    expect(zonedDateKey(instant, "America/Los_Angeles")).toBe("2026-10-11");
  });
});

describe("canonicalTimeZone", () => {
  it("maps every spelling of UTC to UTC", () => {
    for (const name of ["UTC", "utc", "Etc/UTC", "GMT"]) expect(canonicalTimeZone(name)).toBe("UTC");
  });

  it("keeps a normal zone name", () => {
    expect(canonicalTimeZone("Europe/Amsterdam")).toBe("Europe/Amsterdam");
    expect(canonicalTimeZone("europe/amsterdam")).toBe("Europe/Amsterdam");
  });

  it("rejects names that are not zones", () => {
    expect(canonicalTimeZone("Mars/Olympus")).toBeNull();
    expect(canonicalTimeZone("")).toBeNull();
    expect(canonicalTimeZone("A".repeat(65))).toBeNull();
  });
});

describe("listTimeZones", () => {
  it("starts with UTC and includes real zones once", () => {
    const zones = listTimeZones();
    expect(zones[0]).toBe("UTC");
    expect(zones).toContain("Europe/Amsterdam");
    expect(zones.filter((zone) => zone === "UTC")).toHaveLength(1);
    expect(new Set(zones).size).toBe(zones.length);
  });
});
