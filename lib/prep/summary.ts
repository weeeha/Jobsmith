import type { MarkLevel } from "./values";

export type ConfidenceSummary = { solid: number; okay: number; shaky: number; unmarked: number; total: number };

// One count per entry of `questionKeys`: a key listed twice counts twice, and
// a mark for a key that is not listed counts for nothing.
export function summarize(questionKeys: string[], levels: Map<string, MarkLevel>): ConfidenceSummary {
  const out: ConfidenceSummary = { solid: 0, okay: 0, shaky: 0, unmarked: 0, total: questionKeys.length };
  for (const key of questionKeys) {
    const level = levels.get(key);
    if (level === undefined) out.unmarked += 1;
    else out[level] += 1;
  }
  return out;
}

export function summaryLine(c: ConfidenceSummary): string {
  return `${c.solid} solid · ${c.okay} okay · ${c.shaky} shaky · ${c.unmarked} unmarked`;
}

export function homeLine(c: ConfidenceSummary): string {
  return `${c.solid} of ${c.total} solid`;
}
