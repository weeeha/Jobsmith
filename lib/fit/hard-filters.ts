import { normalizeForDedupe } from "@/lib/intake/dedupe";
import type { Preferences } from "@/lib/preferences/schema";
import type { WorkMode } from "@/lib/pipeline/values";

// In the order the test box lists them.
export const HARD_FILTERS = ["title", "location", "work_mode", "pay"] as const;
export type HardFilter = (typeof HARD_FILTERS)[number];

export type HardFilterPosting = {
  roleTitle: string | null;
  location: string | null;
  workMode: WorkMode | null;
  compMin: number | null;
  compMax: number | null;
  compCurrency: string | null;
};

export type FilterOutcome = "passes" | "fails" | "not_checked" | "not_set";

/**
 * One filter's result. `value` is the posting's side of the comparison and
 * `wanted` the preference's side, where a sentence needs them: the keyword
 * or location that matched, or the two currencies that differ.
 */
export type HardFilterCheck = {
  filter: HardFilter;
  outcome: FilterOutcome;
  reason: "missing" | "remote" | "other_currency" | null;
  value: string | null;
  wanted: string | null;
};

export type HardFilterResult = {
  pass: boolean;
  failed: HardFilter[];
  /** Filters that are set but could not be checked against this posting. A remote job's location is skipped, not listed. */
  unchecked: HardFilter[];
  checks: HardFilterCheck[];
};

const isBlank = (value: string | null): value is null => value === null || value.trim() === "";

// Whole-word phrase match on normalized text (case, accents and punctuation
// ignored): "product designer" is in "Sr. Product Designer (Platform)", but
// "design" is not in "Product Designer".
function containsPhrase(haystack: string, needle: string): boolean {
  const h = normalizeForDedupe(haystack);
  const n = normalizeForDedupe(needle);
  return n.length > 0 && ` ${h} `.includes(` ${n} `);
}

function check(filter: HardFilter, outcome: FilterOutcome, extra: Partial<HardFilterCheck> = {}): HardFilterCheck {
  return { filter, outcome, reason: null, value: null, wanted: null, ...extra };
}

function phraseCheck(filter: "title" | "location", wanted: string[], value: string | null): HardFilterCheck {
  if (wanted.length === 0) return check(filter, "not_set");
  if (isBlank(value)) return check(filter, "not_checked", { reason: "missing" });
  const matched = wanted.find((entry) => containsPhrase(value, entry));
  return matched === undefined ? check(filter, "fails", { value }) : check(filter, "passes", { value, wanted: matched });
}

function workModeCheck(posting: HardFilterPosting, preferences: Preferences): HardFilterCheck {
  if (preferences.workModes.length === 0) return check("work_mode", "not_set");
  if (posting.workMode === null) return check("work_mode", "not_checked", { reason: "missing" });
  const outcome = preferences.workModes.includes(posting.workMode) ? "passes" : "fails";
  return check("work_mode", outcome, { value: posting.workMode });
}

function payCheck(posting: HardFilterPosting, preferences: Preferences): HardFilterCheck {
  if (preferences.compFloor === null) return check("pay", "not_set");
  const top = posting.compMax ?? posting.compMin;
  if (top === null) return check("pay", "not_checked", { reason: "missing" });
  // A posting with no stated currency is taken to pay in the user's own.
  if (posting.compCurrency !== null && posting.compCurrency !== preferences.currency) {
    return check("pay", "not_checked", { reason: "other_currency", value: posting.compCurrency, wanted: preferences.currency });
  }
  return check("pay", top >= preferences.compFloor ? "passes" : "fails");
}

/**
 * Checks a posting against the preferences that act as filters. Nothing is
 * stored and nothing is hidden: the result is computed when a page renders,
 * from the preferences as they are now.
 */
export function hardFilters(posting: HardFilterPosting, preferences: Preferences): HardFilterResult {
  // A remote job has no place to match, so the location check is skipped.
  const location =
    preferences.locations.length > 0 && posting.workMode === "remote"
      ? check("location", "not_checked", { reason: "remote" })
      : phraseCheck("location", preferences.locations, posting.location);

  const checks = [
    phraseCheck("title", preferences.titles, posting.roleTitle),
    location,
    workModeCheck(posting, preferences),
    payCheck(posting, preferences),
  ];
  const failed = checks.filter((c) => c.outcome === "fails").map((c) => c.filter);
  const unchecked = checks.filter((c) => c.outcome === "not_checked" && c.reason !== "remote").map((c) => c.filter);
  return { pass: failed.length === 0, failed, unchecked, checks };
}

export function hasHardFilters(preferences: Preferences): boolean {
  return (
    preferences.titles.length > 0 ||
    preferences.locations.length > 0 ||
    preferences.workModes.length > 0 ||
    preferences.compFloor !== null
  );
}
