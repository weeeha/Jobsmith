import { describe, expect, it } from "vitest";
import { fitCardModel, FIT_PENDING_STALE_MS, FIT_POLL_MAX, FIT_POLL_MS, type CardOpportunity } from "@/lib/fit/card";
import { toStoredFit } from "@/lib/fit/stored";
import { DEFAULT_PREFERENCES, type Preferences } from "@/lib/preferences/schema";
import type { FitProfile } from "@/lib/fit/profile";

const NOW = new Date("2026-10-15T12:00:00.000Z");
const STORED = toStoredFit(
  { score: 82, summary: "A senior systems role.", pros: ["Owns the design system"], cons: ["Team size not stated"] },
  "fake-extractor",
  new Date("2026-10-15T09:00:00.000Z"),
);

const OPPORTUNITY: CardOpportunity = {
  id: "00000000-0000-4000-8000-000000000001",
  roleTitle: "Design Lead",
  location: "Berlin, Germany",
  workMode: "onsite",
  compMin: null,
  compMax: null,
  compCurrency: null,
  postingMd: "About the job",
  fitStatus: "done",
  fitScore: 82,
  fit: STORED,
  updatedAt: new Date("2026-10-15T09:00:00.000Z"),
};
const PROFILE: FitProfile = { headline: null, resumeMd: "# Resume", preferences: DEFAULT_PREFERENCES };

function model(over: Partial<CardOpportunity> = {}, profile: Partial<FitProfile> = {}, aiOn = true) {
  return fitCardModel({ opportunity: { ...OPPORTUNITY, ...over }, profile: { ...PROFILE, ...profile }, aiOn, now: NOW });
}
const withPrefs = (over: Partial<Preferences>) => ({ preferences: { ...DEFAULT_PREFERENCES, ...over } });

describe("fitCardModel", () => {
  it("shows a stored score with its band against the user's threshold", () => {
    const m = model();
    expect(m).toMatchObject({ view: "scored", fit: STORED, band: "good", opportunityId: OPPORTUNITY.id });
    expect(model({}, withPrefs({ scoreThreshold: 90 })).band).toBe("mixed");
    expect(model({}, withPrefs({ scoreThreshold: 100 })).band).toBe("weak");
  });

  it("checks the hard filters against the preferences as they are now", () => {
    const m = model({}, withPrefs({ locations: ["Rotterdam"] }));
    expect(m.hardFilters.failed).toEqual(["location"]);
    expect(model().hardFilters.pass).toBe(true);
  });

  it("shows scoring while a run is pending, and failed once it has sat pending too long", () => {
    const pending = { fitStatus: "pending" as const, updatedAt: new Date(NOW.getTime() - 5_000) };
    expect(model(pending).view).toBe("scoring");
    const stale = { fitStatus: "pending" as const, updatedAt: new Date(NOW.getTime() - FIT_PENDING_STALE_MS - 1) };
    expect(model(stale).view).toBe("failed");
  });

  it("shows failed after a failed run", () => {
    expect(model({ fitStatus: "failed", fit: null, fitScore: null }).view).toBe("failed");
  });

  it("names what is missing instead of offering a run that cannot work", () => {
    const none = { fitStatus: "none" as const, fit: null, fitScore: null };
    expect(model(none, { resumeMd: null }).view).toBe("no_resume");
    expect(model(none, {}, false).view).toBe("ai_off");
    expect(model({ ...none, postingMd: "  " }).view).toBe("no_posting");
    expect(model({ fitStatus: "failed", fit: null }, { resumeMd: null }).view).toBe("no_resume");
  });

  it("offers a first score for a ready job that has none", () => {
    expect(model({ fitStatus: "none", fit: null, fitScore: null }).view).toBe("unscored");
  });

  it("treats a done job whose document no longer parses as unscored", () => {
    expect(model({ fit: { v: 9 } }).view).toBe("unscored");
  });

  it("keeps showing a stored score when the resume is later removed", () => {
    expect(model({}, { resumeMd: null }).view).toBe("scored");
  });

  it("polls every 3 seconds, at most 40 times", () => {
    expect(FIT_POLL_MS).toBe(3_000);
    expect(FIT_POLL_MAX).toBe(40);
    expect(FIT_PENDING_STALE_MS).toBe(120_000);
  });
});
