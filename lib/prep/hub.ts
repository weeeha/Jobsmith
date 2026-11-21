import type { ArtifactMeta, Scoped, StageRow } from "@/lib/db/scoped";
import { loadIncludeDocs, makeIncludeResolver } from "./includes";
import { parseQuestionBank, type ParseWarning } from "./parse";
import { summarize, type ConfidenceSummary } from "./summary";
import { PARSED_KINDS, type MarkLevel } from "./values";

// Task 25 widens this union with the audio states.
export type AudioStatus = { state: "browser" };

export type BankCard = {
  key: string;
  title: string;
  kind: "question_bank" | "call_card";
  stageId: string | null;
  stageLabel: string | null;
  version: number;
  questionCount: number;
  summary: ConfidenceSummary;
  warnings: ParseWarning[];
  notice: "no_questions" | null;
  needsRebuild: boolean;
  audio: AudioStatus;
};

export type HubQuestion = {
  id: string;
  artifactKey: string;
  number: number;
  section: string | null;
  position: number;
  question: string;
  questionKey: string;
  unfilled: boolean;
  hasAnswer: boolean;
  level: MarkLevel | null;
};

export type PrepHubView = {
  banks: BankCard[];
  groups: { stageId: string | null; heading: string; banks: BankCard[] }[];
  questions: HubQuestion[];
  empty: boolean;
};

function isParsedKind(kind: string): kind is "question_bank" | "call_card" {
  return (PARSED_KINDS as readonly string[]).includes(kind);
}

export async function loadPrepHub(
  s: Scoped,
  input: { opportunityId: string; docs: ArtifactMeta[]; stages: StageRow[] },
): Promise<PrepHubView> {
  const { opportunityId } = input;
  const rows = await s.prepQuestion.listForJob(opportunityId);
  const marks = await s.prepMark.listForJob(opportunityId);
  const levels = new Map<string, MarkLevel>(marks.map((m) => [m.questionKey, m.level]));
  const stageById = new Map(input.stages.map((st) => [st.id, st]));

  // Same order as the prep tab's own document list: kind, then title, then key.
  const metas = input.docs
    .filter((d) => isParsedKind(d.kind) && d.companyId === null)
    .sort((a, b) => a.title.localeCompare(b.title) || a.key.localeCompare(b.key));

  const banks: BankCard[] = [];
  for (const meta of metas) {
    if (!isParsedKind(meta.kind)) continue;
    const row = await s.artifact.getLatest({ opportunityId }, meta.key);
    if (!row) continue;

    const includeDocs = row.bodyMd.includes("{{include") ? await loadIncludeDocs(s, opportunityId, meta.key) : [];
    const parsed = parseQuestionBank(row.bodyMd, { resolveInclude: makeIncludeResolver(includeDocs) });
    const keyRows = rows.filter((r) => r.artifactKey === meta.key);

    // A call card with no questions is not a bank; a question bank with none
    // still gets a card so the owner is told why.
    if (parsed.questions.length === 0 && meta.kind === "call_card") continue;

    const needsRebuild =
      parsed.questions.length > 0 &&
      (keyRows.length !== parsed.questions.length || keyRows.some((r) => r.artifactVersion !== row.version));
    const stage = meta.stageId ? stageById.get(meta.stageId) : undefined;

    banks.push({
      key: meta.key,
      title: meta.title,
      kind: meta.kind,
      stageId: stage ? stage.id : null,
      stageLabel: stage ? stage.label : null,
      version: row.version,
      questionCount: keyRows.length,
      summary: summarize(keyRows.map((r) => r.questionKey), levels),
      warnings: parsed.warnings,
      notice: parsed.questions.length === 0 ? "no_questions" : null,
      needsRebuild,
      audio: { state: "browser" },
    });
  }

  const groups: PrepHubView["groups"] = [];
  const general = banks.filter((b) => b.stageId === null);
  if (general.length > 0) groups.push({ stageId: null, heading: "General", banks: general });
  for (const stage of [...input.stages].sort((a, b) => a.position - b.position)) {
    const staged = banks.filter((b) => b.stageId === stage.id);
    if (staged.length > 0) groups.push({ stageId: stage.id, heading: stage.label, banks: staged });
  }

  const questions: HubQuestion[] = rows.map((r) => ({
    id: r.id,
    artifactKey: r.artifactKey,
    number: r.number,
    section: r.section,
    position: r.position,
    question: r.question,
    questionKey: r.questionKey,
    unfilled: r.unfilled,
    hasAnswer: r.hasAnswer,
    level: levels.get(r.questionKey) ?? null,
  }));

  // A bank that only carries the "no questions" notice does not make the job
  // a prepared one.
  const empty = !banks.some((b) => b.questionCount > 0 || b.needsRebuild);
  return { banks, groups, questions, empty };
}
