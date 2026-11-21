// The end-of-run summary of a drill. Pure and free of server imports, so the
// client player can build it too.
import type { MarkLevel } from "./values";

export type DrillSummary = {
  marks: { questionKey: string; question: string; level: MarkLevel }[];
  skipped: number;
  stillShaky: { questionKey: string; question: string }[];
  solid: number;
};

// "Still shaky" is every question of the session whose level after the run is
// shaky: a mark given now, or the standing mark of a question that was skipped.
export function summarizeDrill(
  questions: { questionKey: string; question: string; level: MarkLevel | null }[],
  given: Record<string, MarkLevel>,
  skipped: string[],
): DrillSummary {
  const marks: DrillSummary["marks"] = [];
  const stillShaky: DrillSummary["stillShaky"] = [];
  let solid = 0;
  for (const q of questions) {
    const now = given[q.questionKey];
    if (now !== undefined) {
      marks.push({ questionKey: q.questionKey, question: q.question, level: now });
      if (now === "solid") solid += 1;
    }
    if ((now ?? q.level) === "shaky") stillShaky.push({ questionKey: q.questionKey, question: q.question });
  }
  const inSession = new Set(questions.map((q) => q.questionKey));
  return { marks, skipped: new Set(skipped.filter((k) => inSession.has(k))).size, stillShaky, solid };
}
