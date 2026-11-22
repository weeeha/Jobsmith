// What the context document says about Prep and the Library (spec 5.8): each
// question's number, section, mark and last drilled date, and the library's
// titles, kinds and tags. Never an answer, a Spine, audio or a recording: the
// file can be copied into prompts, so it carries labels and marks only.
import type { Scoped } from "@/lib/db/scoped";
import { listLibrary } from "@/lib/library/items";
import type { LibraryKind, MarkLevel } from "@/lib/prep/values";

export type ContextPrep = {
  banks: {
    key: string;
    title: string;
    questions: { number: number; section: string | null; question: string; level: MarkLevel | null; lastDrilledAt: Date | null }[];
  }[];
};
export type ContextLibrary = { items: { title: string; kind: LibraryKind; tags: string[] }[] };

// Rows come back ordered by document key, then position; banks keep that order.
export async function loadContextPrep(s: Scoped, opportunityId: string): Promise<ContextPrep> {
  const rows = await s.prepQuestion.listForJob(opportunityId);
  if (rows.length === 0) return { banks: [] };
  const marks = new Map((await s.prepMark.listForJob(opportunityId)).map((m) => [m.questionKey, m]));
  const titles = new Map((await s.artifact.listLatestForOpportunity(opportunityId)).map((a) => [a.key, a.title]));

  const banks: ContextPrep["banks"] = [];
  for (const row of rows) {
    let bank = banks.at(-1);
    if (!bank || bank.key !== row.artifactKey) {
      bank = { key: row.artifactKey, title: titles.get(row.artifactKey) ?? row.artifactKey, questions: [] };
      banks.push(bank);
    }
    const mark = marks.get(row.questionKey);
    bank.questions.push({
      number: row.number,
      section: row.section,
      question: row.question,
      level: mark?.level ?? null,
      lastDrilledAt: mark?.lastDrilledAt ?? null,
    });
  }
  return { banks };
}

// Unarchived items, newest first.
export async function loadContextLibrary(s: Scoped): Promise<ContextLibrary> {
  const rows = await listLibrary(s, {});
  return { items: rows.map((r) => ({ title: r.title, kind: r.kind, tags: r.tags })) };
}
