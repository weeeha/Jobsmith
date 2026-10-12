import { normalizeForDedupe } from "@/lib/intake/dedupe";
import type { Preferences } from "@/lib/preferences/schema";
import type { WorkMode } from "@/lib/pipeline/values";

export const HARD_FILTERS = ["title", "work_mode", "location", "pay"] as const;
export type HardFilter = (typeof HARD_FILTERS)[number];

export type HardFilterPosting = {
  roleTitle: string | null;
  location: string | null;
  workMode: WorkMode | null;
  compMin: number | null;
  compMax: number | null;
  compCurrency: string | null;
};
export type HardFilterResult = { pass: boolean; failed: HardFilter[]; unchecked: HardFilter[] };

// Whole-word phrase match on normalized text (case, accents and punctuation
// ignored): "product designer" is in "Sr. Product Designer (Platform)", but
// "design" is not in "Product Designer".
function containsPhrase(haystack: string, needle: string): boolean {
  const h = normalizeForDedupe(haystack);
  const n = normalizeForDedupe(needle);
  return n.length > 0 && ` ${h} `.includes(` ${n} `);
}

/**
 * Checks a posting against the preferences that act as filters. Nothing is
 * stored and nothing is hidden: the result is computed when a page renders.
 * A filter whose preference is empty is not checked at all; one whose posting
 * fact is missing is reported as unchecked instead of failed.
 */
export function hardFilters(posting: HardFilterPosting, preferences: Preferences): HardFilterResult {
  const failed: HardFilter[] = [];
  const unchecked: HardFilter[] = [];

  if (preferences.titles.length > 0) {
    const title = posting.roleTitle;
    if (title === null || title.trim() === "") unchecked.push("title");
    else if (!preferences.titles.some((wanted) => containsPhrase(title, wanted))) failed.push("title");
  }

  if (preferences.workModes.length > 0) {
    if (posting.workMode === null) unchecked.push("work_mode");
    else if (!preferences.workModes.includes(posting.workMode)) failed.push("work_mode");
  }

  // A remote job has no place to match, so the location check is skipped.
  if (preferences.locations.length > 0 && posting.workMode !== "remote") {
    const where = posting.location;
    if (where === null || where.trim() === "") unchecked.push("location");
    else if (!preferences.locations.some((wanted) => containsPhrase(where, wanted))) failed.push("location");
  }

  if (preferences.compFloor !== null) {
    const top = posting.compMax ?? posting.compMin;
    const otherCurrency =
      preferences.currency !== null && posting.compCurrency !== null && preferences.currency !== posting.compCurrency;
    if (top === null || otherCurrency) unchecked.push("pay");
    else if (top < preferences.compFloor) failed.push("pay");
  }

  return { pass: failed.length === 0, failed, unchecked };
}
