import { FIT_BAND_WORDS, type FitBand } from "./bands";
import type { FilterOutcome, HardFilter, HardFilterCheck } from "./hard-filters";
import { WORK_MODE_LABELS } from "@/lib/pipeline/labels";
import type { WorkMode } from "@/lib/pipeline/values";

// Every fit line on screen, in one place. Lines that carry a time are not
// built here: the card renders them in JSX around a LocalTime.
export const FIT_MESSAGES = {
  heading: "Fit",
  pros: "Pros",
  cons: "Cons",
  scored: "Scored",
  scoring: "Scoring this job",
  failed: "The fit score didn't come back. Nothing about the job changed.",
  none: "This job has no fit score yet.",
  ai_off: "Fit scoring needs AI, and AI is off on this server.",
  no_posting: "This job has no posting text to score.",
  no_resume: "Add your resume in Settings to get a fit score for this job.",
  openSettings: "Open Settings",
  scoreThisJob: "Score this job",
  scoreAgain: "Score again",
  boardScoring: "Scoring",
} as const;

export const TEST_BOX_MESSAGES = {
  title: "Test against a posting",
  intro: "Runs the hard filters and the fit score on one posting without adding it to the board.",
  label: "Posting",
  placeholder: "https://",
  submit: "Score this posting",
  hardFilters: "Hard filters",
  nothingAdded: "Nothing was added to the board.",
  ai_off: "Fit scoring needs AI, and AI is off on this server. The hard filters still ran.",
  no_resume: "Add your resume in Settings to get a fit score. The hard filters still ran.",
  failed: "The fit score didn't come back. The hard filters still ran.",
} as const;

export const FILTER_ROW_LABELS: Record<HardFilter, string> = {
  title: "Title keywords",
  location: "Locations",
  work_mode: "Work modes",
  pay: "Pay floor",
};

// "Location: Berlin, Germany is not in your locations."
const FILTER_NAMES: Record<HardFilter, string> = {
  title: "Title",
  location: "Location",
  work_mode: "Work mode",
  pay: "Pay",
};

// "Fails location" on a board card.
const FILTER_SHORT_NAMES: Record<HardFilter, string> = {
  title: "title",
  location: "location",
  work_mode: "work mode",
  pay: "pay",
};

// The drafts draw three outcomes. A filter with nothing set was not checked
// either, and its line says why.
export const FILTER_OUTCOME_WORDS: Record<FilterOutcome, string> = {
  passes: "Passes",
  fails: "Fails",
  not_checked: "Not checked",
  not_set: "Not checked",
};

const capitalized = (text: string): string => text.charAt(0).toLocaleUpperCase() + text.slice(1);
const modeLabel = (value: string | null): string => WORK_MODE_LABELS[value as WorkMode] ?? value ?? "";

function titleDetail(c: HardFilterCheck): string {
  switch (c.outcome) {
    case "passes":
      return `${capitalized(c.wanted ?? "")} matches.`;
    case "fails":
      return `${c.value} has none of your title keywords.`;
    case "not_checked":
      return "The posting states no title.";
    case "not_set":
      return "No title keywords set.";
  }
}

function locationDetail(c: HardFilterCheck): string {
  switch (c.outcome) {
    case "passes":
      return `${c.value} is in your locations.`;
    case "fails":
      return `${c.value} is not in your locations.`;
    case "not_checked":
      return c.reason === "remote" ? "The job is remote, so location does not apply." : "The posting states no location.";
    case "not_set":
      return "No locations set.";
  }
}

function workModeDetail(c: HardFilterCheck): string {
  switch (c.outcome) {
    case "passes":
      return `${modeLabel(c.value)} is one of yours.`;
    case "fails":
      return `${modeLabel(c.value)} is not one of yours.`;
    case "not_checked":
      return "The posting states no work mode.";
    case "not_set":
      return "No work modes set.";
  }
}

function payDetail(c: HardFilterCheck): string {
  switch (c.outcome) {
    case "passes":
      return "The top of the range meets your floor.";
    case "fails":
      return "The top of the range is below your floor.";
    case "not_checked":
      return c.reason === "other_currency"
        ? `The posting pays in ${c.value} and your floor is in ${c.wanted}.`
        : "The posting states no pay range.";
    case "not_set":
      return "No pay floor set.";
  }
}

export function filterDetail(c: HardFilterCheck): string {
  switch (c.filter) {
    case "title":
      return titleDetail(c);
    case "location":
      return locationDetail(c);
    case "work_mode":
      return workModeDetail(c);
    case "pay":
      return payDetail(c);
  }
}

export function failedFilterLine(c: HardFilterCheck): string {
  return `${FILTER_NAMES[c.filter]}: ${filterDetail(c)}`;
}

export function cardFailedChip(count: number): string {
  return count === 1 ? "Fails 1 filter" : `Fails ${count} filters`;
}

export function failedBoxHeading(count: number): string {
  return count === 1 ? "Fails a hard filter" : `Fails ${count} hard filters`;
}

export function boardFailedChip(failed: HardFilter[]): string {
  return failed.length === 1 ? `Fails ${FILTER_SHORT_NAMES[failed[0]]}` : `Fails ${failed.length} filters`;
}

export function scoreChipText(score: number, band: FitBand): string {
  return `${score} · ${FIT_BAND_WORDS[band]}`;
}

/** The card's last line when nothing failed; null when the failure box already says it. */
export function filtersFootnote(checks: HardFilterCheck[]): string | null {
  if (checks.some((c) => c.outcome === "fails")) return null;
  if (checks.every((c) => c.outcome === "not_set")) return "No hard filters set.";
  const unchecked = checks
    .filter((c) => c.outcome === "not_checked" && c.reason !== "remote")
    .map((c) => FILTER_ROW_LABELS[c.filter].toLocaleLowerCase());
  return unchecked.length === 0
    ? "Passes your hard filters."
    : `Passes your hard filters. Not checked: ${unchecked.join(", ")}.`;
}
