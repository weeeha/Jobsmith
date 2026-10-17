import { describe, expect, it } from "vitest";
import { cardFit, type BoardFitFacts } from "@/lib/fit/board";
import { FIT_PENDING_STALE_MS } from "@/lib/fit/card";
import { DEFAULT_PREFERENCES, type Preferences } from "@/lib/preferences/schema";

const NOW = new Date("2026-10-15T12:00:00.000Z");
const CARD: BoardFitFacts = {
  roleTitle: "Staff Product Designer",
  location: "Berlin, Germany",
  workMode: "hybrid",
  compMin: null,
  compMax: null,
  compCurrency: null,
  fitScore: 72,
  fitStatus: "done",
  updatedAt: new Date("2026-10-15T09:00:00.000Z"),
};
const prefs = (over: Partial<Preferences> = {}): Preferences => ({ ...DEFAULT_PREFERENCES, ...over });

describe("cardFit", () => {
  it("bands a stored score against the threshold", () => {
    expect(cardFit(CARD, prefs(), NOW)).toEqual({ score: 72, band: "good", scoring: false, failed: [] });
    expect(cardFit({ ...CARD, fitScore: 64 }, prefs(), NOW).band).toBe("mixed");
    expect(cardFit({ ...CARD, fitScore: 41 }, prefs(), NOW).band).toBe("weak");
  });

  it("has no score chip before a score exists", () => {
    expect(cardFit({ ...CARD, fitScore: null, fitStatus: "none" }, prefs(), NOW)).toEqual({
      score: null,
      band: null,
      scoring: false,
      failed: [],
    });
  });

  it("marks the filters a job fails, so a failing job stays on the board, labelled", () => {
    expect(cardFit(CARD, prefs({ locations: ["Rotterdam"] }), NOW).failed).toEqual(["location"]);
    expect(cardFit(CARD, prefs({ locations: ["Rotterdam"], workModes: ["remote"] }), NOW).failed).toEqual([
      "location",
      "work_mode",
    ]);
  });

  it("shows Scoring in place of the score while a run is pending", () => {
    const pending = { ...CARD, fitStatus: "pending" as const, updatedAt: new Date(NOW.getTime() - 1_000) };
    expect(cardFit(pending, prefs(), NOW)).toMatchObject({ scoring: true, score: null, band: null });
  });

  it("stops showing Scoring once a pending run has gone stale, and shows any stored score again", () => {
    const stale = { ...CARD, fitStatus: "pending" as const, updatedAt: new Date(NOW.getTime() - FIT_PENDING_STALE_MS - 1) };
    expect(cardFit(stale, prefs(), NOW)).toMatchObject({ scoring: false, score: 72, band: "good" });
  });
});
