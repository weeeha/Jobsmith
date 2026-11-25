import { describe, expect, it } from "vitest";
import { engineReducer, stepIndexForQuestion, type EngineState } from "@/lib/prep/engine-state";
import type { PlaybackPlan, PlaybackStep } from "@/lib/prep/plan";

function step(questionIndex: number, n: number, gapAfterMs: number): PlaybackStep {
  return {
    id: `${questionIndex}-${n}`,
    questionIndex,
    blockIndex: n === 0 ? null : n - 1,
    kind: n === 0 ? "question" : "text",
    speaker: n === 0 ? "interviewer" : "candidate",
    text: `q${questionIndex} s${n}`,
    hash: "h",
    clip: null,
    gapAfterMs,
  };
}

// Question 0 has 3 steps (indexes 0 to 2), question 1 has 2 (indexes 3 and 4).
const PLAN: PlaybackPlan = {
  title: "Bank",
  subtitle: "Job",
  questions: [],
  steps: [step(0, 0, 600), step(0, 1, 600), step(0, 2, 1400), step(1, 0, 600), step(1, 1, 1400)],
};

const at = (stepIndex: number, status: EngineState["status"], speed = 1): EngineState => ({ stepIndex, status, speed });
const run = (state: EngineState, event: Parameters<typeof engineReducer>[1]) => engineReducer(state, event, PLAN);

describe("engineReducer", () => {
  it("play from idle starts step 0", () => {
    expect(run(at(0, "idle"), { type: "play" })).toEqual(at(0, "playing"));
  });

  it("step_ended on a step with a gap moves to gap; gap_elapsed moves to the next step", () => {
    const gap = run(at(0, "playing"), { type: "step_ended" });
    expect(gap).toEqual(at(0, "gap"));
    expect(run(gap, { type: "gap_elapsed" })).toEqual(at(1, "playing"));
  });

  it("a step without a gap goes straight to the next step", () => {
    const plan = { ...PLAN, steps: PLAN.steps.map((s) => ({ ...s, gapAfterMs: 0 })) };
    expect(engineReducer(at(0, "playing"), { type: "step_ended" }, plan)).toEqual(at(1, "playing"));
  });

  it("the last step ending sets ended", () => {
    expect(run(at(4, "playing"), { type: "step_ended" })).toEqual(at(4, "ended"));
    expect(run(at(4, "gap"), { type: "gap_elapsed" })).toEqual(at(4, "ended"));
  });

  it("step_ended and gap_elapsed outside their status change nothing", () => {
    expect(run(at(1, "paused"), { type: "step_ended" })).toEqual(at(1, "paused"));
    expect(run(at(1, "playing"), { type: "gap_elapsed" })).toEqual(at(1, "playing"));
  });

  it("next_question jumps to the first step of the next question and keeps playing; on the last question it ends", () => {
    expect(run(at(1, "playing"), { type: "next_question" })).toEqual(at(3, "playing"));
    expect(run(at(2, "gap"), { type: "next_question" })).toEqual(at(3, "playing"));
    expect(run(at(4, "playing"), { type: "next_question" })).toEqual(at(4, "ended"));
  });

  it("prev_question jumps to the first step of the previous question; on the first question it restarts it", () => {
    expect(run(at(4, "playing"), { type: "prev_question" })).toEqual(at(0, "playing"));
    expect(run(at(2, "playing"), { type: "prev_question" })).toEqual(at(0, "playing"));
  });

  it("repeat_question restarts the current question's first step", () => {
    expect(run(at(4, "playing"), { type: "repeat_question" })).toEqual(at(3, "playing"));
    expect(run(at(2, "gap"), { type: "repeat_question" })).toEqual(at(0, "playing"));
  });

  it("moving while paused or idle changes the place and not the status", () => {
    expect(run(at(1, "paused"), { type: "next_question" })).toEqual(at(3, "paused"));
    expect(run(at(0, "idle"), { type: "next_question" })).toEqual(at(3, "idle"));
  });

  it("seek_step sets the step and keeps the status unless ended, which becomes playing", () => {
    expect(run(at(0, "paused"), { type: "seek_step", stepIndex: 3 })).toEqual(at(3, "paused"));
    expect(run(at(0, "gap"), { type: "seek_step", stepIndex: 2 })).toEqual(at(2, "gap"));
    expect(run(at(4, "ended"), { type: "seek_step", stepIndex: 1 })).toEqual(at(1, "playing"));
    expect(run(at(0, "playing"), { type: "seek_step", stepIndex: 99 })).toEqual(at(4, "playing"));
  });

  it("pause keeps the step index from playing or gap; play from paused replays the current step from its start", () => {
    expect(run(at(2, "playing"), { type: "pause" })).toEqual(at(2, "paused"));
    expect(run(at(2, "gap"), { type: "pause" })).toEqual(at(2, "paused"));
    expect(run(at(2, "paused"), { type: "play" })).toEqual(at(2, "playing"));
  });

  it("play after the end starts from the beginning", () => {
    expect(run(at(4, "ended"), { type: "play" })).toEqual(at(0, "playing"));
  });

  it("set_speed clamps to 0.8 to 1.5 and rounds to one decimal", () => {
    expect(run(at(0, "idle"), { type: "set_speed", speed: 3 }).speed).toBe(1.5);
    expect(run(at(0, "idle"), { type: "set_speed", speed: 0.1 }).speed).toBe(0.8);
    expect(run(at(0, "idle"), { type: "set_speed", speed: 1.23 }).speed).toBe(1.2);
    expect(run(at(0, "idle"), { type: "set_speed", speed: Number.NaN }).speed).toBe(1);
  });

  it("an empty plan stays ended", () => {
    expect(engineReducer(at(0, "idle"), { type: "play" }, { ...PLAN, steps: [] }).status).toBe("ended");
  });
});

describe("stepIndexForQuestion", () => {
  it("is the first step of that question, or -1 when none follows", () => {
    expect(stepIndexForQuestion(PLAN, 0)).toBe(0);
    expect(stepIndexForQuestion(PLAN, 1)).toBe(3);
    expect(stepIndexForQuestion(PLAN, 2)).toBe(-1);
  });
});
