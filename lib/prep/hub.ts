import type { ArtifactMeta, Scoped, StageRow } from "@/lib/db/scoped";
import { loadIncludeDocs, makeIncludeResolver } from "./includes";
import { parseQuestionBank, type ParseWarning } from "./parse";
import { summarize, type ConfidenceSummary } from "./summary";
import { PARSED_KINDS, type MarkLevel } from "./values";

import { planSegments } from "@/lib/audio/segments";
import { audioStatusFor, toPlanSource, type AudioContext, type AudioStatus } from "./audio-status";

export type { AudioStatus } from "./audio-status";

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

export type PitchCard = { key: string; title: string };

export type PrepHubView = {
  banks: BankCard[];
  // The job's pitch documents: Listen only, never parsed into rows.
  pitches: PitchCard[];
  groups: { stageId: string | null; heading: string; banks: BankCard[] }[];
  questions: HubQuestion[];
  empty: boolean;
};

function isParsedKind(kind: string): kind is "question_bank" | "call_card" {
  return (PARSED_KINDS as readonly string[]).includes(kind);
}

async function bankAudio(s: Scoped, keyRows: Parameters<typeof toPlanSource>[0][], audio: AudioContext | undefined): Promise<AudioStatus> {
  if (!audio || keyRows.length === 0) return { state: "browser" };
  const plan = await planSegments(s, { sources: keyRows.map(toPlanSource), identity: audio.identity, voices: audio.voices });
  return audioStatusFor(plan, audio.ttsOn);
}

export async function loadPrepHub(
  s: Scoped,
  // Without an audio context (TTS and voices unknown) every bank reads as the browser voice.
  input: { opportunityId: string; docs: ArtifactMeta[]; stages: StageRow[]; audio?: AudioContext },
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
      audio: await bankAudio(s, keyRows, input.audio),
    });
  }

  const pitches: PitchCard[] = input.docs
    .filter((d) => d.kind === "pitch" && d.companyId === null)
    .sort((a, b) => a.title.localeCompare(b.title) || a.key.localeCompare(b.key))
    .map((d) => ({ key: d.key, title: d.title }));

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
  return { banks, pitches, groups, questions, empty };
}
