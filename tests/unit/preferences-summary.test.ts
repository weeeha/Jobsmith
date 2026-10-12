import { describe, expect, it } from "vitest";
import { DEFAULT_PREFERENCES, type Preferences } from "@/lib/preferences/schema";
import { preferencesSummaryLines } from "@/lib/preferences/summary";

const prefs = (over: Partial<Preferences>): Preferences => ({ ...DEFAULT_PREFERENCES, ...over });

describe("preferencesSummaryLines", () => {
  it("is empty for the defaults", () => {
    expect(preferencesSummaryLines(DEFAULT_PREFERENCES)).toEqual([]);
  });

  it("writes every set field, in a fixed order", () => {
    expect(
      preferencesSummaryLines(
        prefs({
          industriesAvoid: ["Gambling"],
          titles: ["Product Designer", "UX Lead"],
          companySize: { min: 50, max: 500 },
          dealbreakers: ["On call"],
          seniority: ["senior", "lead"],
          mustHaves: ["Design systems"],
          locations: ["Rotterdam", "Remote EU"],
          compTarget: 200,
          workModes: ["remote", "onsite"],
          compFloor: 150,
          currency: "EUR",
        }),
      ),
    ).toEqual([
      "Job titles: Product Designer, UX Lead",
      "Seniority: Senior, Lead",
      "Locations: Rotterdam, Remote EU",
      "Work modes: Remote, On site",
      "Pay floor: 150 EUR",
      "Pay target: 200 EUR",
      "Must-haves: Design systems",
      "Dealbreakers: On call",
      "Industries to avoid: Gambling",
      "Company size: 50 to 500 people",
    ]);
  });

  it("leaves the currency off when none is set", () => {
    expect(preferencesSummaryLines(prefs({ compFloor: 100 }))).toEqual(["Pay floor: 100"]);
    expect(preferencesSummaryLines(prefs({ compTarget: 0 }))).toEqual(["Pay target: 0"]);
  });

  it("writes the company size three ways", () => {
    expect(preferencesSummaryLines(prefs({ companySize: { min: 50, max: null } }))).toEqual(["Company size: at least 50 people"]);
    expect(preferencesSummaryLines(prefs({ companySize: { min: null, max: 200 } }))).toEqual(["Company size: up to 200 people"]);
    expect(preferencesSummaryLines(prefs({ companySize: { min: 50, max: 200 } }))).toEqual(["Company size: 50 to 200 people"]);
  });

  it("ignores the score threshold and the reminder days", () => {
    expect(preferencesSummaryLines(prefs({ scoreThreshold: 50, attention: { followUpDays: 3, savedDays: 2 } }))).toEqual([]);
  });
});
