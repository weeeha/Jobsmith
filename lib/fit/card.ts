import type { OpportunityRow } from "@/lib/db/scoped";
import { fitBand, type FitBand } from "./bands";
import { hardFilters, type HardFilterResult } from "./hard-filters";
import type { FitProfile } from "./profile";
import { fitReadiness } from "./readiness";
import { parseStoredFit, type StoredFit } from "./stored";

// A run that has sat in `pending` this long was lost with its function
// instance; the card then offers a retry instead of polling for ever.
export const FIT_PENDING_STALE_MS = 120_000;
export const FIT_POLL_MS = 3_000;
export const FIT_POLL_MAX = 40;

/**
 * The drafts' five states (scored, the same with a failed filter, scoring,
 * failed, no resume), plus the lines a job reaches before it can be scored:
 * AI off, no posting text, or ready with no score yet.
 */
export type FitCardView = "scored" | "scoring" | "failed" | "unscored" | "ai_off" | "no_posting" | "no_resume";

export type FitCardModel = {
  opportunityId: string;
  view: FitCardView;
  fit: StoredFit | null;
  band: FitBand | null;
  hardFilters: HardFilterResult;
};

export type CardOpportunity = Pick<
  OpportunityRow,
  | "id"
  | "roleTitle"
  | "location"
  | "workMode"
  | "compMin"
  | "compMax"
  | "compCurrency"
  | "postingMd"
  | "fitStatus"
  | "fitScore"
  | "fit"
  | "updatedAt"
>;

export function isStalePending(fitStatus: OpportunityRow["fitStatus"], updatedAt: Date, now: Date): boolean {
  return fitStatus === "pending" && now.getTime() - updatedAt.getTime() > FIT_PENDING_STALE_MS;
}

export function fitCardModel(input: {
  opportunity: CardOpportunity;
  profile: FitProfile;
  aiOn: boolean;
  now: Date;
}): FitCardModel {
  const { opportunity, profile } = input;
  const fit = parseStoredFit(opportunity.fit);
  const readiness = fitReadiness({ aiOn: input.aiOn, postingMd: opportunity.postingMd, resumeMd: profile.resumeMd });

  let view: FitCardView;
  if (opportunity.fitStatus === "pending") {
    view = isStalePending(opportunity.fitStatus, opportunity.updatedAt, input.now) ? "failed" : "scoring";
  } else if (opportunity.fitStatus === "done" && fit !== null) {
    view = "scored";
  } else if (readiness !== "ready") {
    // A retry could not work, so the card says what is missing instead.
    view = readiness;
  } else {
    view = opportunity.fitStatus === "failed" ? "failed" : "unscored";
  }
  // A stale run offers "Score again"; when the job can no longer be scored,
  // the missing piece is the more useful line.
  if (view === "failed" && readiness !== "ready") view = readiness;

  return {
    opportunityId: opportunity.id,
    view,
    fit: view === "scored" ? fit : null,
    band: view === "scored" && fit !== null ? fitBand(fit.score, profile.preferences.scoreThreshold) : null,
    hardFilters: hardFilters(opportunity, profile.preferences),
  };
}
