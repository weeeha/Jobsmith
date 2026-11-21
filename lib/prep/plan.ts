// Pure, no database: turns questions into the steps the Listen player speaks.
import { questionKey } from "./question-key";
import type { ParsedBlock } from "./parse";
import { GAP_QUESTION_MS, GAP_STEP_MS, type MarkLevel } from "./values";
import { labelSpokenText, toSpokenText } from "@/lib/tts/spoken";

export type Speaker = "interviewer" | "candidate";

export type PlanSource = {
  question: string;
  section: string | null;
  number: number;
  questionKey: string;
  blocks: ParsedBlock[];
  // Who reads the question line. Banks leave it out (the interviewer); pitch
  // chapters set "candidate", so a pitch is spoken in one voice.
  questionSpeaker?: Speaker;
};

export type StepSpec = {
  questionIndex: number;
  blockIndex: number | null;
  kind: "question" | "label" | "text";
  speaker: Speaker;
  text: string;
};

export type PlayerBlock = { index: number; label: string; spoken: boolean; text: string };
export type PlayerQuestion = {
  number: number;
  section: string | null;
  questionKey: string;
  question: string;
  blocks: PlayerBlock[];
  level: MarkLevel | null;
};
export type PlaybackStep = StepSpec & {
  id: string;
  hash: string;
  clip: { assetId: string; suspect: boolean } | null;
  gapAfterMs: number;
};
export type PlaybackPlan = {
  title: string;
  subtitle: string;
  questions: PlayerQuestion[];
  steps: PlaybackStep[];
};

function hasLabelStep(label: string): boolean {
  const key = label.trim().replace(/:$/, "").trim().toLowerCase();
  return key !== "" && key !== "say";
}

export function spokenSteps(sources: PlanSource[]): StepSpec[] {
  const steps: StepSpec[] = [];
  sources.forEach((source, questionIndex) => {
    const question = toSpokenText(source.question);
    if (question !== "") {
      steps.push({ questionIndex, blockIndex: null, kind: "question", speaker: source.questionSpeaker ?? "interviewer", text: question });
    }
    source.blocks.forEach((block, blockIndex) => {
      if (!block.spoken) return;
      const text = toSpokenText(block.text);
      if (text === "") return;
      if (hasLabelStep(block.label)) {
        steps.push({ questionIndex, blockIndex, kind: "label", speaker: "interviewer", text: labelSpokenText(block.label) });
      }
      steps.push({ questionIndex, blockIndex, kind: "text", speaker: "candidate", text });
    });
  });
  return steps;
}

export function buildPlaybackPlan(input: {
  title: string;
  subtitle: string;
  sources: PlanSource[];
  levels: Map<string, MarkLevel>;
  resolveClip: (speaker: Speaker, text: string) => { hash: string; clip: { assetId: string; suspect: boolean } | null };
}): PlaybackPlan {
  const specs = spokenSteps(input.sources);
  const counters = new Map<number, number>();
  const steps = specs.map((spec, i): PlaybackStep => {
    const stepIndex = counters.get(spec.questionIndex) ?? 0;
    counters.set(spec.questionIndex, stepIndex + 1);
    const lastOfQuestion = specs[i + 1]?.questionIndex !== spec.questionIndex;
    const { hash, clip } = input.resolveClip(spec.speaker, spec.text);
    return {
      ...spec,
      id: `${spec.questionIndex}-${stepIndex}`,
      hash,
      clip,
      gapAfterMs: lastOfQuestion ? GAP_QUESTION_MS : GAP_STEP_MS,
    };
  });
  const questions = input.sources.map(
    (source): PlayerQuestion => ({
      number: source.number,
      section: source.section,
      questionKey: source.questionKey,
      question: source.question,
      blocks: source.blocks.map((b, index) => ({ index, label: b.label, spoken: b.spoken, text: b.text })),
      level: input.levels.get(source.questionKey) ?? null,
    }),
  );
  return { title: input.title, subtitle: input.subtitle, questions, steps };
}

// Each "## " heading starts a chapter spoken in the candidate voice, as
// narrate.py does. Whatever sits above the first heading (frontmatter, the
// title line) is not spoken. A "### " line stays inside its chapter.
export function pitchChapters(bodyMd: string): PlanSource[] {
  const chapters: { title: string; lines: string[] }[] = [];
  for (const line of bodyMd.replace(/\r\n?/g, "\n").split("\n")) {
    if (line.startsWith("## ")) {
      chapters.push({ title: line.slice(3).trim(), lines: [] });
    } else if (chapters.length > 0) {
      chapters[chapters.length - 1].lines.push(line);
    }
  }
  return chapters
    .filter((c) => c.title !== "")
    .map((chapter, i): PlanSource => {
      const text = chapter.lines.join("\n").trim();
      return {
        question: chapter.title,
        section: null,
        number: i + 1,
        questionKey: questionKey(chapter.title),
        blocks: text === "" ? [] : [{ label: "", spoken: true, text }],
        questionSpeaker: "candidate",
      };
    });
}
