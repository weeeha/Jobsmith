import type { DiffSummary } from "./diff";
import type { CompareVersion } from "./load";

export type VersionWhen = { word: "edited" | "pushed" | "pasted" | "written" | "generated"; at: Date };
export type HeaderParts = { a: { version: number } & VersionWhen; b: { version: number } & VersionWhen; summary: DiffSummary | null };

const ORIGIN_VERB = {
  pushed: "pushed",
  pasted: "pasted",
  manual: "written",
  generated: "generated",
} as const satisfies Record<CompareVersion["origin"], VersionWhen["word"]>;

/** The word and date for a version header. An edit wins over the origin. Dates are formatted by the component. */
export function versionWhen(v: Pick<CompareVersion, "origin" | "createdAt" | "editedAt">): VersionWhen {
  if (v.editedAt) return { word: "edited", at: v.editedAt };
  return { word: ORIGIN_VERB[v.origin], at: v.createdAt };
}

function count(n: number, singular: string): string {
  return `${n} ${singular}${n === 1 ? "" : "s"}`;
}

export function summaryLine(summary: DiffSummary): string {
  return `${count(summary.wordsAdded, "word")} added, ${summary.wordsRemoved} removed, ${count(summary.sectionsChanged, "section")} changed`;
}
