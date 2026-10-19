import type { OpportunityRow } from "@/lib/db/scoped";
import type { Preferences } from "@/lib/preferences/schema";
import { fitBand, type FitBand } from "./bands";
import { isStalePending } from "./card";
import { hardFilters, type HardFilter, type HardFilterPosting } from "./hard-filters";

export type BoardFitFacts = HardFilterPosting & Pick<OpportunityRow, "fitScore" | "fitStatus" | "updatedAt">;

/** What a board card shows about fit: a banded score or "Scoring", and the filters it fails. */
export type CardFit = { score: number | null; band: FitBand | null; scoring: boolean; failed: HardFilter[] };

export function cardFit(card: BoardFitFacts, preferences: Preferences, now: Date): CardFit {
  const scoring = card.fitStatus === "pending" && !isStalePending(card.fitStatus, card.updatedAt, now);
  const score = scoring ? null : card.fitScore;
  return {
    score,
    band: score === null ? null : fitBand(score, preferences.scoreThreshold),
    scoring,
    failed: hardFilters(card, preferences).failed,
  };
}
