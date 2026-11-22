// What the Library's Drill screen needs: the unarchived items that came from a
// question, in Drill's fixed order, with the steps Drill plays. An item reads
// as its title (the interviewer's line) and its body (the candidate's line),
// the same way lib/audio/segments.ts counts library items, so the hashes
// match the clips generated for it.
import type { Scoped } from "@/lib/db/scoped";
import { fail, ok, type Result } from "@/lib/result";
import { toSpokenText } from "@/lib/tts/spoken";
import type { AudioContext } from "@/lib/prep/audio-status";
import { type DrillData, type DrillQuestion, toStep } from "@/lib/prep/drill";
import { drillGapSeconds } from "@/lib/prep/gaps";
import { orderForDrill, type DrillCandidate } from "@/lib/prep/order";
import { spokenSteps, type PlanSource, type StepSpec } from "@/lib/prep/plan";
import { makeClipResolver } from "@/lib/prep/player-data";
import { getPrepSettings } from "@/lib/prep/settings";
import type { LibraryItemRow } from "@/lib/db/scoped";

// The plan source of one item, shared by the drill loader and the audio action.
export function itemPlanSource(item: Pick<LibraryItemRow, "title" | "bodyMd" | "questionKey">, number: number, key: string): PlanSource {
  return {
    question: item.title,
    section: null,
    number,
    questionKey: key,
    blocks: [{ label: "Say", spoken: true, text: item.bodyMd }],
  };
}

export async function loadLibraryDrillData(
  s: Scoped,
  input: {
    count: number | null;
    onlyShaky?: boolean;
    // The voice identity and voices, as the job drill takes them.
    audio: AudioContext;
  },
): Promise<Result<DrillData, "empty">> {
  const marks = new Map((await s.prepMark.listLibrary()).map((m) => [m.questionKey, m]));
  const items = (await s.libraryItem.list({ includeArchived: false })).filter(
    (item): item is LibraryItemRow & { questionKey: string } => item.questionKey !== null,
  );

  const candidates = items.map((item, position) => ({
    item,
    questionKey: item.questionKey,
    position,
    section: null,
    hasAnswer: item.bodyMd.trim() !== "" && toSpokenText(item.bodyMd) !== "",
    level: marks.get(item.questionKey)?.level ?? null,
    lastDrilledAt: marks.get(item.questionKey)?.lastDrilledAt ?? null,
  })) satisfies (DrillCandidate & { item: unknown })[];

  const chosen = orderForDrill(candidates, { count: input.count ?? undefined, onlyShaky: input.onlyShaky === true });
  if (chosen.length === 0) return fail("empty", "There is nothing to drill yet.");

  // A Spine only when a job's question row has the same key.
  const spines = new Map<string, string | null>();
  for (const { questionKey } of chosen) {
    const row = (await s.prepQuestion.listByQuestionKey(questionKey)).find((r) => r.spine !== null && r.spine.trim() !== "");
    spines.set(questionKey, row?.spine ?? null);
  }

  const settings = await getPrepSettings(s);
  const sources = chosen.map(({ item, questionKey }, i) => itemPlanSource(item, i + 1, questionKey));
  const allSteps = spokenSteps(sources);
  const resolve = await makeClipResolver(s, input.audio, allSteps);

  const questions = chosen.map(({ item, questionKey, level }, index): DrillQuestion => {
    const mine = allSteps.filter((st) => st.questionIndex === index);
    const askSpec: StepSpec = mine.find((st) => st.kind === "question") ?? {
      questionIndex: index,
      blockIndex: null,
      kind: "question",
      speaker: "interviewer",
      text: toSpokenText(item.title) || item.title,
    };
    const saySpecs = mine.filter((st) => st.kind === "text");
    return {
      questionKey,
      number: index + 1,
      section: null,
      question: item.title,
      ask: toStep(askSpec, `${index}-ask`, resolve),
      say: saySpecs.map((spec, i) => toStep(spec, `${index}-say-${i}`, resolve)),
      spine: spines.get(questionKey) ?? null,
      lastLine: null,
      guard: null,
      sayText: item.bodyMd,
      gapSeconds: drillGapSeconds(toSpokenText(item.bodyMd).length, settings.gapFactor),
      level,
    };
  });

  return ok({
    questions,
    settings,
    sessionMeta: { order: questions.map((q) => q.questionKey), docKey: null, section: null, onlyShaky: input.onlyShaky === true },
  });
}
