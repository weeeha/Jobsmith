import type { ArtifactOrigin } from "./values";

export const ARTIFACT_KINDS = [
  { kind: "research", tab: "research", label: "Research", sendable: false, companyWide: true },
  { kind: "fit_brief", tab: "research", label: "Fit brief", sendable: false, companyWide: true },
  { kind: "people_notes", tab: "research", label: "People notes", sendable: false, companyWide: true },
  { kind: "cv", tab: "documents", label: "CV", sendable: true, companyWide: false },
  { kind: "cover_letter", tab: "documents", label: "Cover letter", sendable: true, companyWide: false },
  { kind: "message_draft", tab: "documents", label: "Message", sendable: true, companyWide: false },
  { kind: "question_bank", tab: "prep", label: "Question bank", sendable: false, companyWide: false },
  { kind: "call_card", tab: "prep", label: "Call card", sendable: false, companyWide: false },
  { kind: "pitch", tab: "prep", label: "Pitch", sendable: false, companyWide: false },
  { kind: "glossary", tab: "prep", label: "Glossary", sendable: false, companyWide: false },
  { kind: "debrief", tab: "prep", label: "Debrief", sendable: false, companyWide: false },
  { kind: "other", tab: "prep", label: "Other", sendable: false, companyWide: false },
] as const satisfies readonly { kind: string; tab: "research" | "documents" | "prep"; label: string; sendable: boolean; companyWide: boolean }[];
export type ArtifactKind = (typeof ARTIFACT_KINDS)[number]["kind"];
export type ArtifactTab = "research" | "documents" | "prep";
export const ARTIFACT_KIND_VALUES = ARTIFACT_KINDS.map((k) => k.kind) as [ArtifactKind, ...ArtifactKind[]];

export function kindInfo(kind: ArtifactKind): (typeof ARTIFACT_KINDS)[number] {
  // ARTIFACT_KINDS covers every ArtifactKind by construction (ARTIFACT_KIND_VALUES
  // is derived from it), so this always finds a match for a value that
  // type-checks as ArtifactKind.
  return ARTIFACT_KINDS.find((k) => k.kind === kind)!;
}

export function parseKind(value: string): ArtifactKind | null {
  const normalized = value.trim().toLowerCase();
  const match = ARTIFACT_KINDS.find((k) => k.kind === normalized);
  return match ? match.kind : null;
}

export function kindsForTab(tab: ArtifactTab): ArtifactKind[] {
  return ARTIFACT_KINDS.filter((k) => k.tab === tab).map((k) => k.kind);
}

export const DEFAULT_KIND_FOR_TAB: Record<ArtifactTab, ArtifactKind> = {
  research: "research",
  documents: "cv",
  prep: "question_bank",
};

export const ORIGIN_WORDS: Record<ArtifactOrigin, string> = {
  pushed: "Pushed",
  pasted: "Pasted",
  manual: "Written in the app",
  generated: "Generated",
};
