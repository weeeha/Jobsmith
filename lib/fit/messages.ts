import type { HardFilter } from "@/lib/fit/hard-filters";

// Every line the fit card shows, in one place. Lines that carry a time are
// not built here: the card renders them in JSX around a LocalTime, because a
// LocalTime interpolated into a template string prints as [object Object].
export const FIT_MESSAGES = {
  heading: "Fit",
  whyItFits: "Why it fits",
  mayNotFit: "What may not fit",
  hardFilters: "Hard filters",
  changed: "Your profile changed after this score.",
  pending: "Scoring this job. This can take a few seconds.",
  stalled: "Scoring did not finish.",
  failed: "Scoring did not work this time. The job is saved as it is.",
  none: "This job has no fit score yet.",
  ai_off: "Fit scoring needs AI, and AI is not turned on for this server.",
  no_posting: "Fit scoring needs the posting text, and this job has none.",
  no_resume: "Add your resume in Settings to get a fit score.",
  openSettings: "Open Settings",
  scoreThisJob: "Score this job",
  tryAgain: "Try again",
  scoreAgain: "Score again",
  passes: "Passes your hard filters.",
  noFiltersSet: "No hard filters set.",
  setPreferences: "Set preferences",
} as const;

export const HARD_FILTER_LABELS: Record<HardFilter, string> = {
  title: "job title",
  work_mode: "work mode",
  location: "location",
  pay: "pay floor",
};

function labelList(filters: HardFilter[]): string {
  return filters.map((filter) => HARD_FILTER_LABELS[filter]).join(", ");
}

export function missesFiltersLine(failed: HardFilter[]): string {
  return `Misses your hard filters: ${labelList(failed)}.`;
}

export function uncheckedFiltersLine(unchecked: HardFilter[]): string {
  return `Not checked: ${labelList(unchecked)}.`;
}

// A score equal to the line counts as a good fit, as the Preferences hint says.
export function thresholdLine(score: number, threshold: number): string {
  return score >= threshold ? `Above your good-fit line of ${threshold}.` : `Below your good-fit line of ${threshold}.`;
}

export function scoredAnnouncement(subject: { roleTitle: string; companyName: string }, score: number): string {
  return `Scored ${subject.roleTitle} at ${subject.companyName}: ${score}.`;
}

export function scoreFailureToast(message: string): string {
  return `Could not score this job. ${message}`;
}
