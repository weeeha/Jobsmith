import { describe, expect, it } from "vitest";
import { fieldErrorsByPath } from "@/lib/forms/state";
import {
  DEFAULT_PREFERENCES,
  MAX_ITEM_CHARS,
  MAX_LIST_ITEMS,
  PREFERENCES_VERSION,
  PREFERENCE_LISTS,
  SENIORITY_LABELS,
  SENIORITY_LEVELS,
  hasHardFilters,
  parsePreferences,
  preferencesSchema,
} from "@/lib/preferences/schema";

function errorsFor(raw: unknown): Record<string, string> {
  const result = preferencesSchema.safeParse(raw);
  if (result.success) throw new Error("expected the preferences to be rejected");
  return fieldErrorsByPath(result.error);
}

describe("preferencesSchema defaults", () => {
  it("parses {} to all defaults", () => {
    expect(DEFAULT_PREFERENCES).toEqual({
      v: 1,
      titles: [],
      seniority: [],
      locations: [],
      workModes: [],
      compFloor: null,
      compTarget: null,
      currency: null,
      mustHaves: [],
      dealbreakers: [],
      industriesAvoid: [],
      companySize: { min: null, max: null },
      scoreThreshold: 70,
      attention: { followUpDays: 7, savedDays: 3 },
    });
    expect(PREFERENCES_VERSION).toBe(1);
  });

  it("fills the other attention default when only one is given", () => {
    expect(preferencesSchema.parse({ attention: { followUpDays: 10 } }).attention).toEqual({ followUpDays: 10, savedDays: 3 });
  });

  it("names the five list fields and the seniority labels", () => {
    expect(PREFERENCE_LISTS).toEqual(["titles", "locations", "mustHaves", "dealbreakers", "industriesAvoid"]);
    expect(SENIORITY_LEVELS.map((level) => SENIORITY_LABELS[level])).toEqual([
      "Junior",
      "Mid-level",
      "Senior",
      "Lead",
      "Principal",
      "Director",
    ]);
  });
});

describe("preferencesSchema lists", () => {
  it("trims entries and de-duplicates case-insensitively, keeping the later spelling", () => {
    expect(preferencesSchema.parse({ titles: [" Product Designer ", "product designer", "UX Lead"] }).titles).toEqual([
      "product designer",
      "UX Lead",
    ]);
  });

  it("drops unknown keys", () => {
    expect(parsePreferences({ extra: 1 })).toEqual(DEFAULT_PREFERENCES);
  });

  it("rejects an empty entry, a long entry and a long list with the fixed messages", () => {
    expect(errorsFor({ titles: ["ok", "  "] })).toEqual({ titles: "Remove the empty entry." });
    expect(errorsFor({ locations: ["x".repeat(MAX_ITEM_CHARS + 1)] })).toEqual({ locations: "Keep each entry under 80 characters." });
    const many = Array.from({ length: MAX_LIST_ITEMS + 1 }, (_, i) => `Entry ${i}`);
    expect(errorsFor({ mustHaves: many })).toEqual({ mustHaves: "Keep the list to 20 entries." });
  });

  it("accepts exactly 20 entries of 80 characters", () => {
    const entries = Array.from({ length: MAX_LIST_ITEMS }, (_, i) => `${i}`.padEnd(MAX_ITEM_CHARS, "x"));
    expect(preferencesSchema.parse({ dealbreakers: entries }).dealbreakers).toHaveLength(MAX_LIST_ITEMS);
  });
});

describe("preferencesSchema numbers and codes", () => {
  it("reports each field's own message", () => {
    expect(
      errorsFor({
        compFloor: Number.NaN,
        compTarget: 1.5,
        scoreThreshold: 101,
        attention: { followUpDays: 0, savedDays: 61 },
        currency: "eur",
        companySize: { min: 0, max: 2_000_000 },
      }),
    ).toEqual({
      compFloor: "Enter a number.",
      compTarget: "Enter a whole number.",
      scoreThreshold: "Enter 0 to 100.",
      "attention.followUpDays": "Enter 1 to 60.",
      "attention.savedDays": "Enter 1 to 60.",
      currency: "Enter a three-letter code such as EUR.",
      "companySize.min": "Enter 1 or more.",
      "companySize.max": "Enter a smaller number.",
    });
  });

  it("rejects a negative pay and a pay above the integer ceiling", () => {
    expect(errorsFor({ compFloor: -1 })).toEqual({ compFloor: "Enter 0 or more." });
    expect(errorsFor({ compTarget: 2_147_483_648 })).toEqual({ compTarget: "Enter a smaller number." });
  });

  it("keeps the nested path and the company size refinement on max", () => {
    expect(errorsFor({ companySize: { min: 50, max: 10 } })).toEqual({
      "companySize.max": "The smallest size must not be above the largest.",
    });
  });
});

describe("parsePreferences", () => {
  it("falls back field by field when stored data has bad values", () => {
    const p = parsePreferences({
      titles: ["Product Designer"],
      scoreThreshold: "high",
      companySize: { min: 50, max: 10 },
      workModes: ["remote", "moon"],
    });
    expect(p.titles).toEqual(["Product Designer"]);
    expect(p.scoreThreshold).toBe(70);
    expect(p.companySize).toEqual({ min: null, max: null });
    expect(p.workModes).toEqual([]);
  });

  it("gives defaults for stored data that is not an object", () => {
    expect(parsePreferences(null)).toEqual(DEFAULT_PREFERENCES);
    expect(parsePreferences([1, 2])).toEqual(DEFAULT_PREFERENCES);
    expect(parsePreferences("x")).toEqual(DEFAULT_PREFERENCES);
    expect(parsePreferences(undefined)).toEqual(DEFAULT_PREFERENCES);
  });

  it("returns valid data unchanged", () => {
    const stored = { ...DEFAULT_PREFERENCES, titles: ["Product Designer"], workModes: ["remote" as const], compFloor: 100, currency: "EUR" };
    expect(parsePreferences(stored)).toEqual(stored);
  });
});

describe("hasHardFilters", () => {
  it("is false for the defaults", () => {
    expect(hasHardFilters(DEFAULT_PREFERENCES)).toBe(false);
  });

  it("is true when titles, locations, work modes or a pay floor are set", () => {
    expect(hasHardFilters({ ...DEFAULT_PREFERENCES, titles: ["Designer"] })).toBe(true);
    expect(hasHardFilters({ ...DEFAULT_PREFERENCES, locations: ["Rotterdam"] })).toBe(true);
    expect(hasHardFilters({ ...DEFAULT_PREFERENCES, workModes: ["remote"] })).toBe(true);
    expect(hasHardFilters({ ...DEFAULT_PREFERENCES, compFloor: 0 })).toBe(true);
  });

  it("is false when only prompt-only fields are set", () => {
    expect(
      hasHardFilters({ ...DEFAULT_PREFERENCES, seniority: ["senior"], mustHaves: ["Design systems"], compTarget: 200, scoreThreshold: 50 }),
    ).toBe(false);
  });
});
