export type LabelClass =
  | { kind: "spoken"; label: string }
  | { kind: "note"; label: string; slot: "spine" | "last_line" | "guard" | null }
  | { kind: "unknown"; label: string };

// Checked first, so a label like "If you lose the thread" is a note even
// though it starts like a conditional.
export const NOTE_LABELS: Record<string, "spine" | "last_line" | "guard" | null> = {
  spine: "spine",
  "last line": "last_line",
  guard: "guard",
  "rests on": null,
  "if you lose the thread": null,
  why: null,
};

// Matched against the label after trimming, lower-casing and dropping one
// trailing colon. A new spoken label is one line here.
export const SPOKEN_LABEL_RULES: RegExp[] = [
  /^say$/,
  /^long version$/,
  /^tie to the posting$/,
  /^follow[- ]up\b/,
  /^if (she|he|they|[a-z]+) asks?\b/,
  /^step \d+/,
  /^then, in every case$/,
  /^if (conversational|basic|comfortable)\b/,
  /^fork [ab]\b/,
  /^\d+[.)]\s/,
];

export function classifyLabel(raw: string, style: "bold" | "italic"): LabelClass {
  const label = raw.trim().replace(/:$/, "").trim();
  const key = label.toLowerCase();

  if (Object.prototype.hasOwnProperty.call(NOTE_LABELS, key)) {
    return { kind: "note", label, slot: NOTE_LABELS[key] };
  }
  if (style === "italic") {
    return key.startsWith("if ") ? { kind: "spoken", label } : { kind: "unknown", label };
  }
  if (SPOKEN_LABEL_RULES.some((rule) => rule.test(key))) {
    return { kind: "spoken", label };
  }
  return { kind: "unknown", label };
}
