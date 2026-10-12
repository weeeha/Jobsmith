import { fitBand, type FitBand } from "@/lib/fit/bands";
import { hardFilters, type HardFilterResult } from "@/lib/fit/hard-filters";
import { fitReadiness, type FitReadiness } from "@/lib/fit/readiness";
import { parseStoredFit, type StoredFit } from "@/lib/fit/stored";
import { hasHardFilters } from "@/lib/preferences/schema";
import type { OpportunityRow } from "@/lib/db/scoped";
import type { ProfileView } from "@/lib/profile/store";

// A run that has sat in `pending` this long was lost with its function
// instance; the card then offers a retry instead of polling for ever.
export const FIT_PENDING_STALE_MS = 120_000;
export const FIT_POLL_MS = 3_000;
export const FIT_POLL_MAX = 40;

export type FitCardView = "pending" | "stalled" | "failed" | "done" | "none";

export type FitCardModel = {
  opportunityId: string;
  roleTitle: string;
  companyName: string;
  view: FitCardView;
  readiness: FitReadiness;
  fit: StoredFit | null;
  band: FitBand | null;
  threshold: number;
  profileChangedSince: boolean;
  hardFilters: HardFilterResult;
  hasHardFilters: boolean;
};

type CardOpportunity = Pick<
  OpportunityRow,
  "id" | "roleTitle" | "fitStatus" | "fit" | "updatedAt" | "postingMd" | "location" | "workMode" | "compMin" | "compMax" | "compCurrency"
>;

function viewOf(opportunity: CardOpportunity, fit: StoredFit | null, now: Date): FitCardView {
  switch (opportunity.fitStatus) {
    case "pending":
      return now.getTime() - opportunity.updatedAt.getTime() > FIT_PENDING_STALE_MS ? "stalled" : "pending";
    case "failed":
      return "failed";
    // A done status whose document no longer parses has nothing to show.
    case "done":
      return fit ? "done" : "none";
    default:
      return "none";
  }
}

export function fitCardModel(input: {
  opportunity: CardOpportunity;
  companyName: string;
  profile: ProfileView;
  aiOn: boolean;
  now: Date;
}): FitCardModel {
  const { opportunity, profile } = input;
  const fit = parseStoredFit(opportunity.fit);
  const scoredAt = fit ? new Date(fit.scoredAt) : null;
  return {
    opportunityId: opportunity.id,
    roleTitle: opportunity.roleTitle,
    companyName: input.companyName,
    view: viewOf(opportunity, fit, input.now),
    readiness: fitReadiness({ aiOn: input.aiOn, postingMd: opportunity.postingMd, resumeMd: profile.resumeMd }),
    fit,
    band: fit ? fitBand(fit.score) : null,
    threshold: profile.preferences.scoreThreshold,
    profileChangedSince: scoredAt !== null && profile.updatedAt !== null && profile.updatedAt > scoredAt,
    hardFilters: hardFilters(opportunity, profile.preferences),
    hasHardFilters: hasHardFilters(profile.preferences),
  };
}
