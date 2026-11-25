// The Listen player's state machine. Pure: it knows the plan and the events,
// and nothing about audio, timers or the browser. components/player/engine.ts
// turns its state into side effects.
import type { PlaybackPlan } from "./plan";
import { SPEED_MAX, SPEED_MIN } from "./settings";

export type EngineStatus = "idle" | "playing" | "gap" | "paused" | "ended";
export type EngineState = { stepIndex: number; status: EngineStatus; speed: number };
export type EngineEvent =
  | { type: "play" }
  | { type: "pause" }
  | { type: "step_ended" }
  | { type: "gap_elapsed" }
  | { type: "next_question" }
  | { type: "prev_question" }
  | { type: "repeat_question" }
  | { type: "seek_step"; stepIndex: number }
  | { type: "set_speed"; speed: number };

export function clampSpeed(speed: number): number {
  if (!Number.isFinite(speed)) return 1;
  const rounded = Math.round(speed * 10) / 10;
  return Math.min(SPEED_MAX, Math.max(SPEED_MIN, rounded));
}

/** The first step of that question (or of the next one that has steps), -1 when none follows. */
export function stepIndexForQuestion(plan: PlaybackPlan, questionIndex: number): number {
  return plan.steps.findIndex((s) => s.questionIndex >= questionIndex);
}

function questionOf(plan: PlaybackPlan, stepIndex: number): number {
  return plan.steps[stepIndex]?.questionIndex ?? 0;
}

// A move keeps a running player running and leaves a paused or idle one where
// it is, so a tap on Next while paused never starts sound on its own.
function moved(state: EngineState, stepIndex: number): EngineState {
  const running = state.status === "playing" || state.status === "gap" || state.status === "ended";
  return { ...state, stepIndex, status: running ? "playing" : state.status };
}

export function engineReducer(state: EngineState, event: EngineEvent, plan: PlaybackPlan): EngineState {
  const last = plan.steps.length - 1;
  if (event.type === "set_speed") return { ...state, speed: clampSpeed(event.speed) };
  if (last < 0) return { ...state, stepIndex: 0, status: event.type === "play" ? "ended" : state.status };

  switch (event.type) {
    case "play":
      if (state.status === "playing" || state.status === "gap") return state;
      return { ...state, stepIndex: state.status === "ended" ? 0 : Math.min(state.stepIndex, last), status: "playing" };
    case "pause":
      return state.status === "playing" || state.status === "gap" ? { ...state, status: "paused" } : state;
    case "step_ended": {
      if (state.status !== "playing") return state;
      if (state.stepIndex >= last) return { ...state, status: "ended" };
      return plan.steps[state.stepIndex].gapAfterMs > 0
        ? { ...state, status: "gap" }
        : { ...state, stepIndex: state.stepIndex + 1, status: "playing" };
    }
    case "gap_elapsed":
      if (state.status !== "gap") return state;
      return state.stepIndex >= last
        ? { ...state, status: "ended" }
        : { ...state, stepIndex: state.stepIndex + 1, status: "playing" };
    case "next_question": {
      const next = stepIndexForQuestion(plan, questionOf(plan, state.stepIndex) + 1);
      return next < 0 ? { ...state, stepIndex: last, status: "ended" } : moved(state, next);
    }
    case "prev_question": {
      const current = questionOf(plan, state.stepIndex);
      const before = plan.steps.findLast((s) => s.questionIndex < current);
      const target = stepIndexForQuestion(plan, before ? before.questionIndex : current);
      return moved(state, Math.max(0, target));
    }
    case "repeat_question":
      return moved(state, Math.max(0, stepIndexForQuestion(plan, questionOf(plan, state.stepIndex))));
    case "seek_step": {
      const stepIndex = Math.min(last, Math.max(0, Math.trunc(event.stepIndex)));
      return { ...state, stepIndex, status: state.status === "ended" ? "playing" : state.status };
    }
  }
}
