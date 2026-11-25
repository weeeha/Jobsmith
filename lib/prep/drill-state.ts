// Drill's loop as a pure state machine (spec 5.4): the interviewer asks, a
// silent gap counts down, the answer is revealed, the user marks or skips. A
// mark or skip outside the reveal is ignored on purpose, and a question is
// never asked twice, because the index only moves forward.
import { MORE_TIME_SECONDS } from "./gaps";
import { MARK_LEVELS, type MarkLevel } from "./values";

export type DrillPhase = "ask" | "gap" | "reveal" | "summary";
export type DrillState = {
  index: number;
  phase: DrillPhase;
  remaining: number;
  given: Record<string, MarkLevel>;
  skipped: string[];
  extraSeconds: number;
};
export type DrillEvent =
  | { type: "asked" } // the interviewer finished: start the gap
  | { type: "tick" } // one second
  | { type: "done" } // the user ends the gap early
  | { type: "more_time" } // adds 30 seconds, gap only
  | { type: "mark"; level: MarkLevel } // marks and advances
  | { type: "skip" }; // advances with no mark

export function initialDrillState(): DrillState {
  return { index: 0, phase: "ask", remaining: 0, given: {}, skipped: [], extraSeconds: 0 };
}

export function drillReducer(
  state: DrillState,
  event: DrillEvent,
  questions: { questionKey: string; gapSeconds: number }[],
): DrillState {
  if (state.phase === "summary") return state;
  const question = questions[state.index];
  if (!question) return { ...state, phase: "summary", remaining: 0 };

  const advance = (patch: Partial<DrillState>): DrillState =>
    state.index + 1 >= questions.length
      ? { ...state, ...patch, phase: "summary", remaining: 0 }
      : { ...state, ...patch, index: state.index + 1, phase: "ask", remaining: 0 };

  switch (event.type) {
    case "asked":
      return state.phase === "ask" ? { ...state, phase: "gap", remaining: Math.ceil(question.gapSeconds) } : state;
    case "tick": {
      if (state.phase !== "gap") return state;
      const remaining = Math.max(0, state.remaining - 1);
      return remaining === 0 ? { ...state, phase: "reveal", remaining: 0 } : { ...state, remaining };
    }
    case "done":
      return state.phase === "gap" ? { ...state, phase: "reveal", remaining: 0 } : state;
    case "more_time":
      return state.phase === "gap"
        ? { ...state, remaining: state.remaining + MORE_TIME_SECONDS, extraSeconds: state.extraSeconds + MORE_TIME_SECONDS }
        : state;
    case "mark":
      return state.phase === "reveal" ? advance({ given: { ...state.given, [question.questionKey]: event.level } }) : state;
    case "skip":
      return state.phase === "reveal" ? advance({ skipped: [...state.skipped, question.questionKey] }) : state;
  }
}

// "1" Shaky, "2" Okay, "3" Solid: the order of MARK_LEVELS.
export function keyToLevel(key: string): MarkLevel | null {
  const at = ["1", "2", "3"].indexOf(key);
  return at === -1 ? null : MARK_LEVELS[at];
}
