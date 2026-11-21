import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  buildPlaybackPlan,
  pitchChapters,
  spokenSteps,
  type PlanSource,
  type Speaker,
} from "@/lib/prep/plan";
import { GAP_QUESTION_MS, GAP_STEP_MS, type MarkLevel } from "@/lib/prep/values";

const source = (over: Partial<PlanSource> = {}): PlanSource => ({
  question: "Tell me about yourself",
  section: "Openers",
  number: 1,
  questionKey: "key-1",
  blocks: [
    { label: "Say", spoken: true, text: "I design **systems**." },
    { label: "Spine", spoken: false, text: "Systems, then people." },
    { label: "Long version", spoken: true, text: "- First point\n- Second point" },
  ],
  ...over,
});

describe("spokenSteps", () => {
  it("a question's steps are: the interviewer reads the question, then per spoken block the interviewer reads the label when there is one and the candidate reads the text", () => {
    const steps = spokenSteps([source()]);
    expect(steps.map((s) => [s.kind, s.speaker, s.text])).toEqual([
      ["question", "interviewer", "Tell me about yourself"],
      ["text", "candidate", "I design systems."],
      ["label", "interviewer", "Long version:"],
      ["text", "candidate", "First point. Second point."],
    ]);
  });

  it("Say has no label step: its text is a candidate step only", () => {
    const steps = spokenSteps([source({ blocks: [{ label: "Say:", spoken: true, text: "Hello." }] })]);
    expect(steps.map((s) => s.kind)).toEqual(["question", "text"]);
  });

  it("the label step's text is the label with its colon", () => {
    const steps = spokenSteps([source({ blocks: [{ label: "Tie to the posting", spoken: true, text: "Hello." }] })]);
    expect(steps[1]).toMatchObject({ kind: "label", text: "Tie to the posting:" });
    const already = spokenSteps([source({ blocks: [{ label: "Follow-up:", spoken: true, text: "Hello." }] })]);
    expect(already[1].text).toBe("Follow-up:");
  });

  it("note blocks produce no step", () => {
    const steps = spokenSteps([source({ blocks: [{ label: "Spine", spoken: false, text: "Shape." }] })]);
    expect(steps.map((s) => s.kind)).toEqual(["question"]);
  });

  it("a block's text goes through toSpokenText and a block that is empty after cleaning is skipped", () => {
    const steps = spokenSteps([
      source({
        blocks: [
          { label: "Say", spoken: true, text: "⚠️ " },
          { label: "Long version", spoken: true, text: "**Bold** and [a link](https://example.test)." },
        ],
      }),
    ]);
    expect(steps.map((s) => [s.kind, s.text, s.blockIndex])).toEqual([
      ["question", "Tell me about yourself", null],
      ["label", "Long version:", 1],
      ["text", "Bold and a link.", 1],
    ]);
  });

  it("carries the question index and the original block index", () => {
    const steps = spokenSteps([source(), source({ question: "Second?", number: 2, questionKey: "key-2" })]);
    expect(steps.filter((s) => s.questionIndex === 1)[0]).toMatchObject({ kind: "question", text: "Second?" });
    expect(steps.find((s) => s.text === "I design systems.")?.blockIndex).toBe(0);
    expect(steps.find((s) => s.text === "First point. Second point.")?.blockIndex).toBe(2);
  });
});

describe("buildPlaybackPlan", () => {
  const resolveClip = (speaker: Speaker, text: string) =>
    text === "I design systems."
      ? { hash: `h-${speaker}-clip`, clip: { assetId: "asset-1", suspect: false } }
      : { hash: `h-${speaker}-${text.length}`, clip: null };

  it("gaps: 600 ms after every step inside a question and 1400 ms after a question's last step", () => {
    const plan = buildPlaybackPlan({
      title: "Bank",
      subtitle: "Role at Company",
      sources: [source(), source({ question: "Second?", number: 2, questionKey: "key-2", blocks: [] })],
      levels: new Map(),
      resolveClip,
    });
    expect(GAP_STEP_MS).toBe(600);
    expect(GAP_QUESTION_MS).toBe(1400);
    expect(plan.steps.map((s) => s.gapAfterMs)).toEqual([600, 600, 600, 1400, 1400]);
  });

  it("a two-question bank with one clip and one browser step: the clip step carries its assetId, the other has clip null, and both carry a hash", () => {
    const plan = buildPlaybackPlan({
      title: "Bank",
      subtitle: "Role at Company",
      sources: [
        source({ question: "Q one", blocks: [{ label: "Say", spoken: true, text: "I design systems." }] }),
        source({ question: "Q two", number: 2, questionKey: "key-2", blocks: [] }),
      ],
      levels: new Map(),
      resolveClip,
    });
    const clipStep = plan.steps.find((s) => s.text === "I design systems.")!;
    expect(clipStep.clip).toEqual({ assetId: "asset-1", suspect: false });
    expect(clipStep.hash).toBe("h-candidate-clip");
    const browserStep = plan.steps.find((s) => s.text === "Q two")!;
    expect(browserStep.clip).toBeNull();
    expect(browserStep.hash).toMatch(/^h-interviewer-/);
  });

  it("step ids are stable: '<questionIndex>-<stepIndex>'", () => {
    const plan = buildPlaybackPlan({
      title: "t",
      subtitle: "s",
      sources: [source(), source({ question: "Second?", number: 2, questionKey: "key-2" })],
      levels: new Map(),
      resolveClip,
    });
    expect(plan.steps.map((s) => s.id)).toEqual(["0-0", "0-1", "0-2", "0-3", "1-0", "1-1", "1-2", "1-3"]);
  });

  it("the plan's questions carry blocks with their original index and the level of the mark", () => {
    const levels = new Map<string, MarkLevel>([["key-1", "shaky"]]);
    const plan = buildPlaybackPlan({ title: "Bank", subtitle: "Role at Company", sources: [source(), source({ number: 2, questionKey: "key-2" })], levels, resolveClip });
    expect(plan.title).toBe("Bank");
    expect(plan.subtitle).toBe("Role at Company");
    expect(plan.questions[0]).toMatchObject({ number: 1, section: "Openers", questionKey: "key-1", question: "Tell me about yourself", level: "shaky" });
    expect(plan.questions[0].blocks.map((b) => [b.index, b.label, b.spoken])).toEqual([
      [0, "Say", true],
      [1, "Spine", false],
      [2, "Long version", true],
    ]);
    expect(plan.questions[1].level).toBeNull();
  });
});

describe("pitchChapters", () => {
  const pitch = readFileSync(path.resolve(__dirname, "../fixtures/packet/nwl-pitch.md"), "utf8");

  it("turns each ## heading of the nwl-pitch.md fixture into a chapter: Short version and Long version", () => {
    const chapters = pitchChapters(pitch);
    expect(chapters.map((c) => c.question)).toEqual(["Short version", "Long version"]);
    expect(chapters.map((c) => c.number)).toEqual([1, 2]);
    expect(chapters[0].blocks).toEqual([{ label: "", spoken: true, text: "One sentence framing of the case study." }]);
    expect(chapters[1].blocks[0].text).toContain("Describes the design problem tackled.");
    expect(chapters[1].blocks[0].text).toContain("Describes the measurable outcome.");
  });

  it("a chapter's steps are candidate steps only, with the chapter title read by the candidate voice first", () => {
    const steps = spokenSteps(pitchChapters(pitch));
    expect(steps.every((s) => s.speaker === "candidate")).toBe(true);
    expect(steps.filter((s) => s.questionIndex === 0).map((s) => [s.kind, s.text])).toEqual([
      ["question", "Short version"],
      ["text", "One sentence framing of the case study."],
    ]);
  });

  it("text above the first ## heading of a pitch is not spoken", () => {
    const steps = spokenSteps(pitchChapters(pitch));
    expect(steps.map((s) => s.text).join(" ")).not.toContain("Portfolio walkthrough");
    expect(pitchChapters("Intro only, no headings.")).toEqual([]);
  });

  it("a chapter with no text under its heading is just its title", () => {
    const steps = spokenSteps(pitchChapters("## Only a title\n\n## Next\n\nBody."));
    expect(steps.filter((s) => s.questionIndex === 0)).toHaveLength(1);
  });
});
