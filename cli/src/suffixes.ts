export type SuffixEntry = { kind?: string; stage?: string; title?: string; scope?: string };

export const BUILT_IN_SUFFIXES: Record<string, SuffixEntry> = {
  recon: { kind: "research", scope: "company" },
  "design-recon": { kind: "research", scope: "company" },
  jd: { kind: "research" },
  "jd-evidence-map": { kind: "research" },
  "fit-brief": { kind: "fit_brief" },
  "fit-by-requirement": { kind: "fit_brief" },
  people: { kind: "people_notes" },
  cv: { kind: "cv" },
  "cover-letter": { kind: "cover_letter" },
  "recruiter-reply": { kind: "message_draft" },
  outreach: { kind: "message_draft" },
  "followup-note": { kind: "message_draft" },
  "form-answers": { kind: "message_draft" },
  "hr-bank": { kind: "question_bank", stage: "recruiter_screen" },
  "question-bank": { kind: "question_bank" },
  "interview-questions": { kind: "question_bank" },
  "answers-full": { kind: "question_bank" },
  curveballs: { kind: "question_bank" },
  "call-card": { kind: "call_card" },
  "recruiter-call-script": { kind: "call_card", stage: "recruiter_screen" },
  "hr-screen-prep": { kind: "call_card", stage: "recruiter_screen" },
  "pitch-and-story": { kind: "pitch" },
  intros: { kind: "pitch" },
  "intros-audio": { kind: "pitch" },
  "why-reasons": { kind: "pitch" },
  glossary: { kind: "glossary" },
  debrief: { kind: "debrief" },
};

export function mergeSuffixes(
  base: Record<string, SuffixEntry>,
  extra: Record<string, SuffixEntry>,
): Record<string, SuffixEntry> {
  const merged: Record<string, SuffixEntry> = { ...base };
  for (const [key, value] of Object.entries(extra)) {
    merged[key] = { ...base[key], ...value };
  }
  return merged;
}

export function lookupSuffix(key: string, map: Record<string, SuffixEntry>): SuffixEntry | undefined {
  if (map[key]) {
    return map[key];
  }
  let best: string | undefined;
  for (const name of Object.keys(map)) {
    if (key.startsWith(`${name}-`) && (!best || name.length > best.length)) {
      best = name;
    }
  }
  return best ? map[best] : undefined;
}
