import { describe, expect, it } from "vitest";
import { hardFilters, hasHardFilters, type HardFilterPosting } from "@/lib/fit/hard-filters";
import { DEFAULT_PREFERENCES, type Preferences } from "@/lib/preferences/schema";

// Pay figures are small abstract values, never realistic salaries.
const POSTING: HardFilterPosting = {
  roleTitle: "Sr. Product Designer (Platform)",
  location: "Rotterdam, Netherlands",
  workMode: "hybrid",
  compMin: 100,
  compMax: 200,
  compCurrency: "EUR",
};
const prefs = (over: Partial<Preferences>): Preferences => ({ ...DEFAULT_PREFERENCES, ...over });
const pass = { pass: true, failed: [], unchecked: [] };

function summary(posting: HardFilterPosting, over: Partial<Preferences>) {
  const { pass: passed, failed, unchecked } = hardFilters(posting, prefs(over));
  return { pass: passed, failed, unchecked };
}

describe("hardFilters", () => {
  it.each([
    ["empty preferences pass everything", {}, POSTING, pass],
    ["a title phrase matches whole words", { titles: ["product designer"] }, POSTING, pass],
    ["part of a word does not match", { titles: ["design"] }, POSTING, { pass: false, failed: ["title"], unchecked: [] }],
    ["any one of several titles is enough", { titles: ["UX Lead", "Product-Designer"] }, POSTING, pass],
    ["an accented phrase matches the accented title", { titles: ["Diseñador"] }, { ...POSTING, roleTitle: "Diseñador de producto" }, pass],
    ["an accented phrase matches the unaccented title", { titles: ["Diseñador"] }, { ...POSTING, roleTitle: "Disenador de producto" }, pass],
    ["a slash separates words in the title", { titles: ["UX/UI Designer"] }, { ...POSTING, roleTitle: "Senior UX/UI Designer" }, pass],
    ["a phrase must match whole words across the slash", { titles: ["UX Designer"] }, { ...POSTING, roleTitle: "Senior UX/UI Designer" }, { pass: false, failed: ["title"], unchecked: [] }],
    ["a colon and brackets in the title are separators", { titles: ["Gestalter:in"] }, { ...POSTING, roleTitle: "UX Gestalter:in (m/w/d)" }, pass],
    ["a bracketed suffix does not hide the title", { titles: ["Designer"] }, { ...POSTING, roleTitle: "Product Designer (m/w/d)" }, pass],
    ["a work mode outside the list fails", { workModes: ["remote"] }, POSTING, { pass: false, failed: ["work_mode"], unchecked: [] }],
    ["an unknown work mode is unchecked", { workModes: ["remote"] }, { ...POSTING, workMode: null }, { pass: true, failed: [], unchecked: ["work_mode"] }],
    ["a location match ignores case and accents", { locations: ["netherlands"] }, POSTING, pass],
    ["a location that is absent fails", { locations: ["Berlin"] }, POSTING, { pass: false, failed: ["location"], unchecked: [] }],
    ["a remote job skips the location check", { locations: ["Berlin"] }, { ...POSTING, workMode: "remote" }, pass],
    ["pay that tops out under the floor fails", { compFloor: 300, currency: "EUR" }, POSTING, { pass: false, failed: ["pay"], unchecked: [] }],
    ["pay that tops out at the floor passes", { compFloor: 200, currency: "EUR" }, POSTING, pass],
    ["a lone minimum is compared when there is no maximum", { compFloor: 150, currency: "EUR" }, { ...POSTING, compMax: null }, { pass: false, failed: ["pay"], unchecked: [] }],
    ["no stated pay is unchecked", { compFloor: 150 }, { ...POSTING, compMin: null, compMax: null }, { pass: true, failed: [], unchecked: ["pay"] }],
    ["pay in another currency is unchecked", { compFloor: 300, currency: "USD" }, POSTING, { pass: true, failed: [], unchecked: ["pay"] }],
    ["pay with no stated currency is compared as it is", { compFloor: 300, currency: "USD" }, { ...POSTING, compCurrency: null }, { pass: false, failed: ["pay"], unchecked: [] }],
  ] as const)("%s", (_name, over, posting, expected) => {
    expect(summary(posting as HardFilterPosting, over as Partial<Preferences>)).toEqual(expected);
  });

  it("leaves the title unchecked when a title is wanted and the posting has none", () => {
    expect(summary({ ...POSTING, roleTitle: null }, { titles: ["Designer"] })).toEqual({
      pass: true,
      failed: [],
      unchecked: ["title"],
    });
    expect(summary({ ...POSTING, roleTitle: "   " }, { titles: ["Designer"] }).unchecked).toEqual(["title"]);
  });

  it("leaves the location unchecked when the posting has none", () => {
    expect(summary({ ...POSTING, location: null }, { locations: ["Rotterdam"] }).unchecked).toEqual(["location"]);
  });

  it("reports several misses together, in the order the test box lists them", () => {
    const result = summary(POSTING, { titles: ["Engineer"], workModes: ["remote"], locations: ["Berlin"], compFloor: 300, currency: "EUR" });
    expect(result).toEqual({ pass: false, failed: ["title", "location", "work_mode", "pay"], unchecked: [] });
  });
});

describe("hardFilters checks", () => {
  it("gives one check per filter, in a fixed order, marking unset preferences", () => {
    expect(hardFilters(POSTING, DEFAULT_PREFERENCES).checks).toEqual([
      { filter: "title", outcome: "not_set", reason: null, value: null, wanted: null },
      { filter: "location", outcome: "not_set", reason: null, value: null, wanted: null },
      { filter: "work_mode", outcome: "not_set", reason: null, value: null, wanted: null },
      { filter: "pay", outcome: "not_set", reason: null, value: null, wanted: null },
    ]);
  });

  it("names the title keyword and the location that matched", () => {
    const { checks } = hardFilters(POSTING, prefs({ titles: ["UX Lead", "product designer"], locations: ["Berlin", "netherlands"] }));
    expect(checks[0]).toEqual({ filter: "title", outcome: "passes", reason: null, value: POSTING.roleTitle, wanted: "product designer" });
    expect(checks[1]).toEqual({ filter: "location", outcome: "passes", reason: null, value: POSTING.location, wanted: "netherlands" });
  });

  it("carries the posting's own value on a failure", () => {
    const { checks } = hardFilters(POSTING, prefs({ titles: ["Engineer"], locations: ["Berlin"], workModes: ["remote"] }));
    expect(checks.slice(0, 3)).toEqual([
      { filter: "title", outcome: "fails", reason: null, value: POSTING.roleTitle, wanted: null },
      { filter: "location", outcome: "fails", reason: null, value: POSTING.location, wanted: null },
      { filter: "work_mode", outcome: "fails", reason: null, value: "hybrid", wanted: null },
    ]);
  });

  it("says why a filter was not checked", () => {
    const remote = hardFilters({ ...POSTING, workMode: "remote" }, prefs({ locations: ["Berlin"] })).checks[1];
    expect(remote).toEqual({ filter: "location", outcome: "not_checked", reason: "remote", value: null, wanted: null });

    const noPay = hardFilters({ ...POSTING, compMin: null, compMax: null }, prefs({ compFloor: 150 })).checks[3];
    expect(noPay).toEqual({ filter: "pay", outcome: "not_checked", reason: "missing", value: null, wanted: null });

    const otherCurrency = hardFilters(POSTING, prefs({ compFloor: 150, currency: "USD" })).checks[3];
    expect(otherCurrency).toEqual({ filter: "pay", outcome: "not_checked", reason: "other_currency", value: "EUR", wanted: "USD" });
  });
});

describe("hasHardFilters", () => {
  it("is false for the defaults and true once any filter preference is set", () => {
    expect(hasHardFilters(DEFAULT_PREFERENCES)).toBe(false);
    expect(hasHardFilters(prefs({ titles: ["Designer"] }))).toBe(true);
    expect(hasHardFilters(prefs({ locations: ["Berlin"] }))).toBe(true);
    expect(hasHardFilters(prefs({ workModes: ["remote"] }))).toBe(true);
    expect(hasHardFilters(prefs({ compFloor: 0 }))).toBe(true);
  });

  it("ignores the fields that only feed the score", () => {
    expect(hasHardFilters(prefs({ mustHaves: ["Design systems"], compTarget: 200, seniority: ["senior"] }))).toBe(false);
  });
});
