import { describe, expect, it } from "vitest";
import { hardFilters, type HardFilterPosting } from "@/lib/fit/hard-filters";
import { DEFAULT_PREFERENCES, type Preferences } from "@/lib/preferences/schema";

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
    ["a lone minimum is compared when there is no maximum", { compFloor: 150 }, { ...POSTING, compMax: null }, { pass: false, failed: ["pay"], unchecked: [] }],
    ["no stated pay is unchecked", { compFloor: 150 }, { ...POSTING, compMin: null, compMax: null }, { pass: true, failed: [], unchecked: ["pay"] }],
    ["pay in another currency is unchecked", { compFloor: 300, currency: "USD" }, POSTING, { pass: true, failed: [], unchecked: ["pay"] }],
    ["without a preferred currency the figures are compared as they are", { compFloor: 300 }, POSTING, { pass: false, failed: ["pay"], unchecked: [] }],
  ] as const)("%s", (_name, over, posting, expected) => {
    expect(hardFilters(posting as HardFilterPosting, prefs(over as Partial<Preferences>))).toEqual(expected);
  });

  it("leaves the title unchecked when a title is wanted and the posting has none", () => {
    expect(hardFilters({ ...POSTING, roleTitle: null }, prefs({ titles: ["Designer"] }))).toEqual({
      pass: true,
      failed: [],
      unchecked: ["title"],
    });
    expect(hardFilters({ ...POSTING, roleTitle: "   " }, prefs({ titles: ["Designer"] })).unchecked).toEqual(["title"]);
  });

  it("leaves the location unchecked when the posting has none", () => {
    expect(hardFilters({ ...POSTING, location: null }, prefs({ locations: ["Rotterdam"] })).unchecked).toEqual(["location"]);
  });

  it("reports several misses together, in a fixed order", () => {
    const result = hardFilters(POSTING, prefs({ titles: ["Engineer"], workModes: ["remote"], locations: ["Berlin"], compFloor: 300 }));
    expect(result).toEqual({ pass: false, failed: ["title", "work_mode", "location", "pay"], unchecked: [] });
  });
});
