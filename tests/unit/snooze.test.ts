import { describe, expect, it } from "vitest";
import { SNOOZE_DAYS, SNOOZE_FALLBACK_TEXT, SNOOZE_HOUR, SNOOZE_PRESETS, snoozeUntil } from "@/lib/attention/snooze";

describe("snoozeUntil", () => {
  const now = new Date("2026-10-11T20:30:00.000Z");

  it("sets 09:00 in the profile zone, that many calendar days ahead", () => {
    // 22:30 on the 11th in Amsterdam: tomorrow 09:00 is 07:00Z on the 12th.
    expect(snoozeUntil("tomorrow", now, "Europe/Amsterdam").toISOString()).toBe("2026-10-12T07:00:00.000Z");
    expect(snoozeUntil("in_3_days", now, "Europe/Amsterdam").toISOString()).toBe("2026-10-14T07:00:00.000Z");
    expect(snoozeUntil("next_week", now, "Europe/Amsterdam").toISOString()).toBe("2026-10-18T07:00:00.000Z");
  });

  it("reads 'today' in the profile zone, not in UTC", () => {
    // It is still the 11th in New York, so tomorrow is the 12th at 09:00 EDT.
    expect(snoozeUntil("tomorrow", now, "America/New_York").toISOString()).toBe("2026-10-12T13:00:00.000Z");
    // In Tokyo it is already the 12th (05:30), so tomorrow is the 13th.
    expect(snoozeUntil("tomorrow", now, "Asia/Tokyo").toISOString()).toBe("2026-10-13T00:00:00.000Z");
  });

  it("keeps 09:00 local across the end of daylight saving time", () => {
    expect(snoozeUntil("tomorrow", new Date("2026-10-24T20:00:00.000Z"), "Europe/Amsterdam").toISOString()).toBe("2026-10-25T08:00:00.000Z");
    expect(snoozeUntil("next_week", new Date("2026-10-24T20:00:00.000Z"), "Europe/Amsterdam").toISOString()).toBe("2026-10-31T08:00:00.000Z");
  });

  it("works in UTC", () => {
    expect(snoozeUntil("tomorrow", now, "UTC").toISOString()).toBe("2026-10-12T09:00:00.000Z");
  });
});

describe("snooze constants", () => {
  it("has three presets and the fallback texts for items with no next action", () => {
    expect(SNOOZE_PRESETS).toEqual(["tomorrow", "in_3_days", "next_week"]);
    expect(SNOOZE_DAYS).toEqual({ tomorrow: 1, in_3_days: 3, next_week: 7 });
    expect(SNOOZE_HOUR).toBe(9);
    expect(SNOOZE_FALLBACK_TEXT).toEqual({ follow_up: "Follow up", apply_or_drop: "Apply or drop" });
  });
});
