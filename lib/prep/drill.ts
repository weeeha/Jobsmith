// What the Drill screen needs, built on the server: the questions in their
// fixed order with the steps Drill plays, and the pure end-of-run summary.
import type { Scoped } from "@/lib/db/scoped";
import { fail, ok, type Result } from "@/lib/result";
import { toSpokenText } from "@/lib/tts/spoken";
import type { AudioContext } from "./audio-status";
import { drillGapSeconds, sayBlock, sayLength } from "./gaps";
import { orderForDrill, type DrillCandidate } from "./order";
import { spokenSteps, type PlaybackStep, type PlanSource, type StepSpec } from "./plan";
import { makeClipResolver, type ClipResolver } from "./player-data";
import { getPrepSettings, type PrepSettings } from "./settings";
import type { MarkLevel } from "./values";

export { summarizeDrill, type DrillSummary } from "./drill-summary";

export type DrillQuestion = {
  questionKey: string;
  number: number;
  section: string | null;
  question: string;
  ask: PlaybackStep; // the interviewer reading the question
  say: PlaybackStep[]; // the candidate reading the Say block (or the first spoken block)
  spine: string | null;
  lastLine: string | null;
  guard: string | null;
  sayText: string;
  gapSeconds: number; // drillGapSeconds(sayLength, settings.gapFactor)
  level: MarkLevel | null;
};

export type DrillSessionMeta = { order: string[]; docKey: string | null; section: string | null; onlyShaky: boolean };
export type DrillData = { questions: DrillQuestion[]; settings: PrepSettings; sessionMeta: DrillSessionMeta };

function toStep(spec: StepSpec, id: string, resolve: ClipResolver): PlaybackStep {
  const { hash, clip } = resolve(spec.speaker, spec.text);
  // Drill pauses on its own timer, so no step has a gap after it.
  return { ...spec, id, hash, clip, gapAfterMs: 0 };
}

export async function loadDrillData(
  s: Scoped,
  input: {
    opportunityId: string;
    docKey: string | null;
    section: string | null;
    count: number | null;
    onlyShaky: boolean;
    // The voice identity and voices, as loadPlayerData takes them, so the
    // hashes match the clips the hub and the audio actions generated.
    audio: AudioContext;
  },
): Promise<Result<DrillData, "not_found" | "empty">> {
  const opportunity = await s.opportunity.getById(input.opportunityId);
  if (!opportunity) return fail("not_found", "That job was not found.");

  const rows =
    input.docKey === null
      ? await s.prepQuestion.listForJob(opportunity.id)
      : await s.prepQuestion.listForArtifactKey(opportunity.id, input.docKey);
  const marks = new Map((await s.prepMark.listForJob(opportunity.id)).map((m) => [m.questionKey, m]));

  const candidates = rows.map((row) => ({
    row,
    questionKey: row.questionKey,
    position: row.position,
    section: row.section,
    hasAnswer: row.hasAnswer,
    level: marks.get(row.questionKey)?.level ?? null,
    lastDrilledAt: marks.get(row.questionKey)?.lastDrilledAt ?? null,
  })) satisfies (DrillCandidate & { row: unknown })[];

  const chosen = orderForDrill(candidates, {
    count: input.count ?? undefined,
    section: input.section ?? undefined,
    onlyShaky: input.onlyShaky,
  });
  if (chosen.length === 0) return fail("empty", "There is nothing to drill yet.");

  const settings = await getPrepSettings(s);
  const sources: PlanSource[] = chosen.map(({ row }) => ({
    question: row.question,
    section: row.section,
    number: row.number,
    questionKey: row.questionKey,
    blocks: row.blocks,
  }));
  const allSteps = spokenSteps(sources);
  const resolve = await makeClipResolver(s, input.audio, allSteps);

  const questions = chosen.map(({ row, level }, index): DrillQuestion => {
    const mine = allSteps.filter((st) => st.questionIndex === index);
    const askSpec: StepSpec = mine.find((st) => st.kind === "question") ?? {
      questionIndex: index,
      blockIndex: null,
      kind: "question",
      speaker: "interviewer",
      text: toSpokenText(row.question) || row.question,
    };
    const block = sayBlock(row.blocks);
    const blockIndex = block ? row.blocks.indexOf(block) : -1;
    const saySpecs = mine.filter((st) => st.kind === "text" && st.blockIndex === blockIndex);
    return {
      questionKey: row.questionKey,
      number: row.number,
      section: row.section,
      question: row.question,
      ask: toStep(askSpec, `${index}-ask`, resolve),
      say: saySpecs.map((spec, i) => toStep(spec, `${index}-say-${i}`, resolve)),
      spine: row.spine,
      lastLine: row.lastLine,
      guard: row.guard,
      sayText: block?.text ?? "",
      gapSeconds: drillGapSeconds(sayLength(row.blocks), settings.gapFactor),
      level,
    };
  });

  return ok({
    questions,
    settings,
    sessionMeta: {
      order: questions.map((q) => q.questionKey),
      docKey: input.docKey,
      section: input.section,
      onlyShaky: input.onlyShaky,
    },
  });
}
