// What the Library's Quick-fire practices: every active job's questions that
// have a Spine, and every unarchived library item that has a question key.
import type { Scoped } from "@/lib/db/scoped";
import type { MarkLevel } from "@/lib/prep/values";
import { firstLine } from "./items";

export type PracticeQuestion = {
  questionKey: string;
  question: string;
  spine: string | null;
  source: "job" | "library";
  // The library-scope mark, since a library round marks in that scope.
  level: MarkLevel | null;
};

// One entry per question key. A row wins over an item, because it has a real
// Spine; an item with no matching row uses its first line (plan decision).
export async function loadLibraryQuickFirePool(s: Scoped): Promise<PracticeQuestion[]> {
  const levels = new Map<string, MarkLevel>((await s.prepMark.listLibrary()).map((m) => [m.questionKey, m.level]));
  const byKey = new Map<string, PracticeQuestion>();

  for (const card of await s.opportunity.listBoard()) {
    for (const row of await s.prepQuestion.listForJob(card.id)) {
      if (row.spine === null || row.spine.trim() === "" || byKey.has(row.questionKey)) continue;
      byKey.set(row.questionKey, {
        questionKey: row.questionKey,
        question: row.question,
        spine: row.spine,
        source: "job",
        level: levels.get(row.questionKey) ?? null,
      });
    }
  }

  for (const item of await s.libraryItem.list({ includeArchived: false })) {
    if (item.questionKey === null || byKey.has(item.questionKey)) continue;
    const spine = firstLine(item.bodyMd);
    if (spine === "") continue;
    byKey.set(item.questionKey, {
      questionKey: item.questionKey,
      question: item.title,
      spine,
      source: "library",
      level: levels.get(item.questionKey) ?? null,
    });
  }
  return [...byKey.values()];
}
