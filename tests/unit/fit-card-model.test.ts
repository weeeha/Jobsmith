import { describe, expect, it } from "vitest";
import { FIT_PENDING_STALE_MS, fitCardModel } from "@/lib/fit/card";
import { parsePreferences } from "@/lib/preferences/schema";
import type { ProfileView } from "@/lib/profile/store";

const NOW = new Date("2026-10-11T12:00:00.000Z");
const RESUME = "Product designer with eight years in internal tools and design systems.";

type Opportunity = Parameters<typeof fitCardModel>[0]["opportunity"];

function opportunity(overrides: Partial<Opportunity> = {}): Opportunity {
  return {
    id: "00000000-0000-4000-8000-000000000001",
    roleTitle: "Product Designer",
    fitStatus: "none",
    fit: null,
    updatedAt: NOW,
    postingMd: "About the job. We are looking for a designer.",
    location: "Amsterdam",
    workMode: "hybrid",
    compMin: null,
    compMax: null,
    compCurrency: null,
    ...overrides,
  };
}

function profile(overrides: Partial<ProfileView> = {}): ProfileView {
  return { headline: null, resumeMd: RESUME, timezone: "UTC", preferences: parsePreferences({}), updatedAt: null, ...overrides };
}

const STORED_FIT = {
  v: 1,
  score: 81,
  summary: "A strong match for internal tools work.",
  pros: ["Eight years in design systems."],
  cons: ["The posting does not state pay."],
  modelId: "fake-extractor",
  scoredAt: "2026-10-10T09:00:00.000Z",
};

function model(
  overrides: { opportunity?: Partial<Opportunity>; profile?: Partial<ProfileView>; aiOn?: boolean } = {},
) {
  return fitCardModel({
    opportunity: opportunity(overrides.opportunity),
    companyName: "Northwind Traders",
    profile: profile(overrides.profile),
    aiOn: overrides.aiOn ?? true,
    now: NOW,
  });
}

describe("fitCardModel: view", () => {
  it("is none for a job that was never scored", () => {
    const result = model();
    expect(result).toMatchObject({
      opportunityId: "00000000-0000-4000-8000-000000000001",
      roleTitle: "Product Designer",
      companyName: "Northwind Traders",
      view: "none",
      readiness: "ready",
      fit: null,
      band: null,
    });
  });

  it("is pending while the run is inside the stale window", () => {
    expect(model({ opportunity: { fitStatus: "pending", updatedAt: new Date(NOW.getTime() - 30_000) } }).view).toBe("pending");
  });

  it("keeps pending at exactly the stale limit and calls it stalled one millisecond later", () => {
    expect(FIT_PENDING_STALE_MS).toBe(120_000);
    const atLimit = new Date(NOW.getTime() - FIT_PENDING_STALE_MS);
    const pastLimit = new Date(NOW.getTime() - FIT_PENDING_STALE_MS - 1);
    expect(model({ opportunity: { fitStatus: "pending", updatedAt: atLimit } }).view).toBe("pending");
    expect(model({ opportunity: { fitStatus: "pending", updatedAt: pastLimit } }).view).toBe("stalled");
  });

  it("is failed, and keeps the previous fit for the header chip's sake", () => {
    const result = model({ opportunity: { fitStatus: "failed", fit: STORED_FIT } });
    expect(result.view).toBe("failed");
    expect(result.fit?.score).toBe(81);
    expect(result.band).toBe("strong");
  });

  it("is done with the parsed fit and its band", () => {
    const result = model({ opportunity: { fitStatus: "done", fit: STORED_FIT } });
    expect(result.view).toBe("done");
    expect(result.fit).toEqual(STORED_FIT);
    expect(result.band).toBe("strong");
  });

  it.each([
    [81, "strong"],
    [55, "partial"],
    [12, "weak"],
  ])("puts a score of %i in the %s band", (score, band) => {
    expect(model({ opportunity: { fitStatus: "done", fit: { ...STORED_FIT, score } } }).band).toBe(band);
  });

  it("falls back to none when the status says done but the stored fit does not parse", () => {
    const result = model({ opportunity: { fitStatus: "done", fit: { v: 2, score: "high" } } });
    expect(result.view).toBe("none");
    expect(result.fit).toBeNull();
    expect(result.band).toBeNull();
  });
});

describe("fitCardModel: readiness", () => {
  it("reads AI, posting and resume in that order", () => {
    expect(model({ aiOn: false, opportunity: { postingMd: null }, profile: { resumeMd: null } }).readiness).toBe("ai_off");
    expect(model({ opportunity: { postingMd: null }, profile: { resumeMd: null } }).readiness).toBe("no_posting");
    expect(model({ opportunity: { postingMd: "   " } }).readiness).toBe("no_posting");
    expect(model({ profile: { resumeMd: null } }).readiness).toBe("no_resume");
  });
});

describe("fitCardModel: profile changes and the good fit line", () => {
  const done = { fitStatus: "done" as const, fit: STORED_FIT };

  it("flags a profile saved after the score", () => {
    expect(model({ opportunity: done, profile: { updatedAt: new Date("2026-10-10T09:00:01.000Z") } }).profileChangedSince).toBe(true);
  });

  it("does not flag a profile saved before the score, at the same instant, or never saved", () => {
    expect(model({ opportunity: done, profile: { updatedAt: new Date("2026-10-10T08:59:59.000Z") } }).profileChangedSince).toBe(false);
    expect(model({ opportunity: done, profile: { updatedAt: new Date("2026-10-10T09:00:00.000Z") } }).profileChangedSince).toBe(false);
    expect(model({ opportunity: done, profile: { updatedAt: null } }).profileChangedSince).toBe(false);
  });

  it("does not flag a job without a stored fit", () => {
    expect(model({ profile: { updatedAt: NOW } }).profileChangedSince).toBe(false);
  });

  it("carries the good fit line from the preferences", () => {
    expect(model().threshold).toBe(70);
    expect(model({ profile: { preferences: parsePreferences({ scoreThreshold: 55 }) } }).threshold).toBe(55);
  });
});

describe("fitCardModel: hard filters", () => {
  it("passes everything and reports no filters set with empty preferences", () => {
    const result = model();
    expect(result.hasHardFilters).toBe(false);
    expect(result.hardFilters).toEqual({ pass: true, failed: [], unchecked: [] });
  });

  it("checks the job's own columns against the saved preferences", () => {
    const preferences = parsePreferences({ titles: ["Design Lead"], workModes: ["remote"], compFloor: 200 });
    const result = model({ profile: { preferences }, opportunity: { compMax: 150 } });
    expect(result.hasHardFilters).toBe(true);
    expect(result.hardFilters.pass).toBe(false);
    expect(result.hardFilters.failed).toEqual(["title", "work_mode", "pay"]);
  });

  it("reports a filter it could not check", () => {
    const preferences = parsePreferences({ workModes: ["remote"] });
    const result = model({ profile: { preferences }, opportunity: { workMode: null } });
    expect(result.hardFilters).toEqual({ pass: true, failed: [], unchecked: ["work_mode"] });
  });
});
