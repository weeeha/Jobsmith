import { describe, expect, it } from "vitest";
import { drillReducer, initialDrillState, keyToLevel, type DrillEvent, type DrillState } from "@/lib/prep/drill-state";

const QS = [
  { questionKey: "a", gapSeconds: 15 },
  { questionKey: "b", gapSeconds: 7.5 },
  { questionKey: "c", gapSeconds: 20 },
];

function run(events: DrillEvent[], from: DrillState = initialDrillState(), questions = QS): DrillState {
  return events.reduce((state, event) => drillReducer(state, event, questions), from);
}

describe("drillReducer", () => {
  it("starts in ask on the first question", () => {
    expect(initialDrillState()).toEqual({ index: 0, phase: "ask", remaining: 0, given: {}, skipped: [], extraSeconds: 0 });
  });

  it("asked moves to gap with remaining equal to the question's gapSeconds rounded up", () => {
    expect(run([{ type: "asked" }]).phase).toBe("gap");
    expect(run([{ type: "asked" }]).remaining).toBe(15);
    const second = run([{ type: "asked" }, { type: "done" }, { type: "skip" }, { type: "asked" }]);
    expect(second.index).toBe(1);
    expect(second.remaining).toBe(8);
  });

  it("tick counts down one second and reaching zero moves to reveal", () => {
    let state = run([{ type: "asked" }]);
    state = run([{ type: "tick" }], state);
    expect(state).toMatchObject({ phase: "gap", remaining: 14 });
    state = run(Array.from({ length: 13 }, () => ({ type: "tick" }) as const), state);
    expect(state).toMatchObject({ phase: "gap", remaining: 1 });
    state = run([{ type: "tick" }], state);
    expect(state).toMatchObject({ phase: "reveal", remaining: 0 });
  });

  it("tick outside the gap does nothing", () => {
    const ask = initialDrillState();
    expect(run([{ type: "tick" }], ask)).toEqual(ask);
    const reveal = run([{ type: "asked" }, { type: "done" }]);
    expect(run([{ type: "tick" }], reveal)).toEqual(reveal);
  });

  it("done moves from gap to reveal at once", () => {
    const state = run([{ type: "asked" }, { type: "done" }]);
    expect(state).toMatchObject({ phase: "reveal", remaining: 0 });
    expect(run([{ type: "done" }]).phase).toBe("ask");
  });

  it("more_time adds 30 seconds in gap and is ignored in other phases", () => {
    const gap = run([{ type: "asked" }, { type: "more_time" }]);
    expect(gap).toMatchObject({ phase: "gap", remaining: 45, extraSeconds: 30 });
    expect(run([{ type: "more_time" }]).extraSeconds).toBe(0);
    const reveal = run([{ type: "asked" }, { type: "done" }, { type: "more_time" }]);
    expect(reveal.extraSeconds).toBe(0);
    expect(reveal.remaining).toBe(0);
  });

  it("mark in reveal records the level, advances to the next question's ask and keeps the question order", () => {
    const state = run([{ type: "asked" }, { type: "done" }, { type: "mark", level: "shaky" }]);
    expect(state).toMatchObject({ index: 1, phase: "ask", given: { a: "shaky" }, skipped: [] });
    const later = run([{ type: "asked" }, { type: "done" }, { type: "mark", level: "solid" }], state);
    expect(later.index).toBe(2);
    expect(later.given).toEqual({ a: "shaky", b: "solid" });
  });

  it("mark on the last question moves to summary", () => {
    const state = run([
      { type: "asked" }, { type: "done" }, { type: "mark", level: "okay" },
      { type: "asked" }, { type: "done" }, { type: "mark", level: "okay" },
      { type: "asked" }, { type: "done" }, { type: "mark", level: "solid" },
    ]);
    expect(state.phase).toBe("summary");
    expect(state.given).toEqual({ a: "okay", b: "okay", c: "solid" });
  });

  it("skip advances without recording a mark and lists the question as skipped", () => {
    const state = run([{ type: "asked" }, { type: "done" }, { type: "skip" }]);
    expect(state).toMatchObject({ index: 1, phase: "ask", given: {}, skipped: ["a"] });
  });

  it("a question is never asked twice in one session", () => {
    // Walk every path (mark, skip) through the three questions: the index only grows.
    const seen: number[] = [];
    let state = initialDrillState();
    const script: DrillEvent[] = [
      { type: "asked" }, { type: "done" }, { type: "skip" },
      { type: "asked" }, { type: "done" }, { type: "mark", level: "shaky" },
      { type: "asked" }, { type: "done" }, { type: "skip" },
    ];
    for (const event of script) {
      state = drillReducer(state, event, QS);
      if (event.type === "asked") seen.push(state.index);
    }
    expect(seen).toEqual([0, 1, 2]);
    expect(state.phase).toBe("summary");
    // A finished session ignores every event.
    expect(drillReducer(state, { type: "asked" }, QS)).toEqual(state);
    expect(drillReducer(state, { type: "skip" }, QS)).toEqual(state);
  });

  it("mark and skip are ignored in ask and gap: the answer is revealed first", () => {
    const ask = initialDrillState();
    expect(run([{ type: "mark", level: "solid" }, { type: "skip" }], ask)).toEqual(ask);
    const gap = run([{ type: "asked" }]);
    expect(run([{ type: "mark", level: "solid" }, { type: "skip" }], gap)).toEqual(gap);
  });

  it("an empty question list stays at summary", () => {
    expect(drillReducer(initialDrillState(), { type: "asked" }, []).phase).toBe("summary");
  });
});

describe("keyToLevel", () => {
  it("maps '1', '2' and '3' and nothing else", () => {
    expect(keyToLevel("1")).toBe("shaky");
    expect(keyToLevel("2")).toBe("okay");
    expect(keyToLevel("3")).toBe("solid");
    for (const key of ["0", "4", "a", " ", "", "Enter", "11"]) expect(keyToLevel(key)).toBeNull();
  });
});
