import { describe, expect, it } from "vitest";
import { STAGE_KINDS } from "@/lib/pipeline/kinds";
import {
  NEW_STAGE,
  defaultStages,
  placementIndex,
  nextStageId,
  planMove,
  planAddStage,
  planReorder,
  planRename,
  planSkip,
  planUnskip,
  planRemove,
  type OpportunityState,
} from "@/lib/pipeline/rules";
import { buildState, type StageSpec } from "../helpers/pipeline-state";
import { expectOk, expectFail } from "../helpers/result";

const NOW = new Date("2026-09-19T12:00:00.000Z");
const PAST = new Date("2026-09-01T12:00:00.000Z");
const FUTURE = new Date("2026-10-01T12:00:00.000Z");

describe("defaultStages", () => {
  it("returns the seven kinds in board order with their default labels", () => {
    expect(defaultStages()).toEqual(STAGE_KINDS.map((k) => ({ kind: k.kind, label: k.defaultLabel })));
  });
});

describe("placementIndex", () => {
  const cases: { name: string; specs: StageSpec[]; kind: StageSpec["kind"]; expected: number }[] = [
    {
      name: "right after the one existing stage of the same kind",
      specs: [{ kind: "saved" }, { kind: "applied" }, { kind: "portfolio_case" }],
      kind: "portfolio_case",
      expected: 3,
    },
    {
      name: "right after the last of two existing stages of the same kind",
      specs: [{ kind: "saved" }, { kind: "applied" }, { kind: "portfolio_case" }, { kind: "portfolio_case" }],
      kind: "portfolio_case",
      expected: 4,
    },
    {
      name: "right after the last stage whose kind comes earlier, when none of the same kind exist",
      specs: [{ kind: "saved" }, { kind: "applied" }, { kind: "hiring_manager" }, { kind: "offer" }],
      kind: "portfolio_case",
      expected: 3,
    },
    {
      name: "index 0 when no stage has an earlier kind",
      specs: [{ kind: "portfolio_case" }],
      kind: "recruiter_screen",
      expected: 0,
    },
    {
      name: "never after Offer",
      specs: [{ kind: "saved" }, { kind: "applied" }, { kind: "offer" }],
      kind: "panel_final",
      expected: 2,
    },
  ];

  for (const c of cases) {
    it(c.name, () => {
      const { stages } = buildState(c.specs, 0);
      expect(placementIndex(stages, c.kind)).toBe(c.expected);
    });
  }
});

describe("nextStageId", () => {
  const cases: { name: string; specs: StageSpec[]; currentIndex: number; expected: string | null }[] = [
    {
      name: "the first later stage that is not skipped",
      specs: [{ kind: "saved", status: "done" }, { kind: "applied" }, { kind: "recruiter_screen" }],
      currentIndex: 1,
      expected: "s2",
    },
    {
      name: "skips over a skipped stage",
      specs: [
        { kind: "saved", status: "done" },
        { kind: "applied" },
        { kind: "recruiter_screen", status: "skipped" },
        { kind: "hiring_manager" },
      ],
      currentIndex: 1,
      expected: "s3",
    },
    {
      name: "null when the current stage is last",
      specs: [{ kind: "saved", status: "done" }, { kind: "applied" }],
      currentIndex: 1,
      expected: null,
    },
    {
      name: "null when every later stage is skipped",
      specs: [
        { kind: "saved", status: "done" },
        { kind: "applied" },
        { kind: "recruiter_screen", status: "skipped" },
        { kind: "hiring_manager", status: "skipped" },
      ],
      currentIndex: 1,
      expected: null,
    },
  ];

  for (const c of cases) {
    it(c.name, () => {
      const state = buildState(c.specs, c.currentIndex);
      expect(nextStageId(state)).toBe(c.expected);
    });
  }
});

describe("planMove", () => {
  it("forward by one", () => {
    const state = buildState(
      [
        { kind: "saved", status: "done", enteredAt: PAST, completedAt: PAST },
        { kind: "applied", enteredAt: PAST },
        { kind: "recruiter_screen" },
      ],
      1,
    );
    const plan = expectOk(planMove(state, { kind: "recruiter_screen" }, NOW));
    expect(plan).toEqual({
      create: null,
      order: null,
      patches: [
        { id: "s1", status: "done", completedAt: NOW },
        { id: "s2", enteredAt: NOW },
      ],
      currentStageId: "s2",
      from: { stageId: "s1", kind: "applied", label: "Applied" },
      to: { stageId: "s2", kind: "recruiter_screen", label: "Recruiter screen" },
    });
  });

  it("forward jump that skips two upcoming stages and leaves a scheduled one alone", () => {
    const state = buildState(
      [
        { kind: "saved", status: "done" },
        { kind: "applied", enteredAt: PAST },
        { kind: "recruiter_screen" },
        { kind: "hiring_manager", status: "scheduled", scheduledAt: FUTURE },
        { kind: "portfolio_case" },
        { kind: "panel_final" },
      ],
      1,
    );
    const plan = expectOk(planMove(state, { kind: "panel_final" }, NOW));
    expect(plan.patches).toEqual([
      { id: "s1", status: "done", completedAt: NOW },
      { id: "s2", status: "skipped" },
      { id: "s4", status: "skipped" },
      { id: "s5", enteredAt: NOW },
    ]);
    expect(plan.currentStageId).toBe("s5");
  });

  it("backward by two with one future-dated stage", () => {
    const state = buildState(
      [
        { kind: "saved", status: "done", enteredAt: PAST, completedAt: PAST },
        { kind: "applied", status: "done", enteredAt: PAST, completedAt: PAST },
        { kind: "recruiter_screen", status: "done", enteredAt: PAST, completedAt: PAST },
        { kind: "hiring_manager", status: "scheduled", scheduledAt: FUTURE, enteredAt: PAST },
      ],
      3,
    );
    const plan = expectOk(planMove(state, { stageId: "s1" }, NOW));
    expect(plan.patches).toEqual([
      { id: "s2", status: "upcoming", completedAt: null },
      { id: "s3", status: "scheduled", completedAt: null },
      { id: "s1", status: "upcoming", completedAt: null },
    ]);
    expect(plan.currentStageId).toBe("s1");
    expect(plan.from).toEqual({ stageId: "s3", kind: "hiring_manager", label: "Hiring manager" });
  });

  it("kind target with two stages of that kind where the first is skipped", () => {
    const state = buildState(
      [
        { kind: "saved", status: "done" },
        { kind: "applied", enteredAt: PAST },
        { kind: "portfolio_case", status: "skipped", label: "Portfolio review" },
        { kind: "portfolio_case", label: "Take-home" },
      ],
      1,
    );
    const plan = expectOk(planMove(state, { kind: "portfolio_case" }, NOW));
    expect(plan.currentStageId).toBe("s3");
    expect(plan.to).toEqual({ stageId: "s3", kind: "portfolio_case", label: "Take-home" });
    expect(plan.patches).toEqual([
      { id: "s1", status: "done", completedAt: NOW },
      { id: "s3", enteredAt: NOW },
    ]);
  });

  it("kind target where all stages of that kind are skipped resolves to the first of them", () => {
    const state = buildState(
      [
        { kind: "saved", status: "done" },
        { kind: "applied", enteredAt: PAST },
        { kind: "portfolio_case", status: "skipped", label: "A" },
        { kind: "portfolio_case", status: "skipped", label: "B" },
      ],
      1,
    );
    const plan = expectOk(planMove(state, { kind: "portfolio_case" }, NOW));
    expect(plan.currentStageId).toBe("s2");
    expect(plan.to.label).toBe("A");
    expect(plan.patches).toEqual([
      { id: "s1", status: "done", completedAt: NOW },
      { id: "s2", status: "upcoming", completedAt: null, enteredAt: NOW },
    ]);
  });

  it("kind target with a missing stage is created and placed before Offer", () => {
    const state = buildState(
      [
        { kind: "saved", status: "done" },
        { kind: "applied", status: "done" },
        { kind: "hiring_manager", enteredAt: PAST },
        { kind: "offer" },
      ],
      2,
    );
    const plan = expectOk(planMove(state, { kind: "portfolio_case" }, NOW));
    expect(plan.create).toEqual({ kind: "portfolio_case", label: "Portfolio review" });
    expect(plan.order).toEqual(["s0", "s1", "s2", NEW_STAGE, "s3"]);
    expect(plan.currentStageId).toBe(NEW_STAGE);
    expect(plan.patches).toEqual([
      { id: "s2", status: "done", completedAt: NOW },
      { id: NEW_STAGE, enteredAt: NOW },
    ]);
  });

  it("a missing kind placed at or before the current stage is created as a backward move", () => {
    const state = buildState(
      [
        { kind: "saved", status: "done" },
        { kind: "applied", status: "done" },
        { kind: "hiring_manager", enteredAt: PAST },
        { kind: "offer" },
      ],
      2,
    );
    const plan = expectOk(planMove(state, { kind: "recruiter_screen" }, NOW));
    expect(plan.create).toEqual({ kind: "recruiter_screen", label: "Recruiter screen" });
    expect(plan.order).toEqual(["s0", "s1", NEW_STAGE, "s2", "s3"]);
    expect(plan.currentStageId).toBe(NEW_STAGE);
    expect(plan.patches).toEqual([
      { id: "s2", status: "upcoming", completedAt: null },
      { id: NEW_STAGE, enteredAt: NOW },
    ]);
    expect(plan.to).toEqual({ stageId: NEW_STAGE, kind: "recruiter_screen", label: "Recruiter screen" });
  });

  it("a skipped target with a future date becomes scheduled, not upcoming", () => {
    const state = buildState(
      [
        { kind: "saved", status: "done" },
        { kind: "applied", enteredAt: PAST },
        { kind: "recruiter_screen", status: "skipped", scheduledAt: FUTURE },
      ],
      1,
    );
    const plan = expectOk(planMove(state, { kind: "recruiter_screen" }, NOW));
    expect(plan.patches).toEqual([
      { id: "s1", status: "done", completedAt: NOW },
      { id: "s2", status: "scheduled", completedAt: null, enteredAt: NOW },
    ]);
  });

  it("in a reordered job, a drop onto a column to the right can still be a backward move", () => {
    // Board-column order would put "Panel / final" to the right of
    // "Recruiter" (rank 5 vs rank 2), but this job's own stepper was
    // reordered so the panel_final stage sits earlier than recruiter_screen.
    const state = buildState(
      [
        { kind: "saved", status: "done" },
        { kind: "applied", status: "done" },
        { kind: "panel_final", status: "done", enteredAt: PAST },
        { kind: "recruiter_screen", enteredAt: PAST },
        { kind: "hiring_manager" },
        { kind: "portfolio_case" },
        { kind: "offer" },
      ],
      3,
    );
    const plan = expectOk(planMove(state, { kind: "panel_final" }, NOW));
    expect(plan.currentStageId).toBe("s2");
    expect(plan.from).toEqual({ stageId: "s3", kind: "recruiter_screen", label: "Recruiter screen" });
    expect(plan.patches).toEqual([
      { id: "s3", status: "upcoming", completedAt: null },
      { id: "s2", status: "upcoming", completedAt: null },
    ]);
  });

  it("moving back onto a done stage returns it to upcoming", () => {
    const state = buildState(
      [
        { kind: "saved", status: "done", enteredAt: PAST, completedAt: PAST },
        { kind: "applied", status: "done", enteredAt: PAST, completedAt: PAST },
        { kind: "recruiter_screen", enteredAt: PAST },
      ],
      2,
    );
    const plan = expectOk(planMove(state, { stageId: "s0" }, NOW));
    expect(plan.currentStageId).toBe("s0");
    expect(plan.patches).toEqual([
      { id: "s1", status: "upcoming", completedAt: null },
      { id: "s2", status: "upcoming", completedAt: null },
      { id: "s0", status: "upcoming", completedAt: null },
    ]);
  });

  it("keeps enteredAt on a second visit to a stage", () => {
    const state = buildState(
      [
        { kind: "saved", status: "done" },
        { kind: "applied", enteredAt: PAST },
        { kind: "recruiter_screen", enteredAt: PAST },
      ],
      2,
    );
    const plan = expectOk(planMove(state, { kind: "applied" }, NOW));
    expect(plan.currentStageId).toBe("s1");
    // Only the old current stage (s2) is patched; s1 needed no field
    // changes (already upcoming, enteredAt already set), so it has no
    // patch entry at all.
    expect(plan.patches).toEqual([{ id: "s2", status: "upcoming", completedAt: null }]);
  });

  it("rejects a move on a closed opportunity", () => {
    const state = buildState([{ kind: "saved" }, { kind: "applied" }], 1, "closed");
    expectFail(planMove(state, { kind: "recruiter_screen" }, NOW), "closed");
  });

  it("rejects a stageId target equal to the current stage", () => {
    const state = buildState([{ kind: "saved" }, { kind: "applied" }], 1);
    expectFail(planMove(state, { stageId: "s1" }, NOW), "same_stage");
  });

  it("rejects a kind target equal to the current stage's kind, even with another stage of that kind", () => {
    const state = buildState(
      [{ kind: "saved" }, { kind: "portfolio_case" }, { kind: "portfolio_case" }],
      1,
    );
    expectFail(planMove(state, { kind: "portfolio_case" }, NOW), "same_column");
  });

  it("rejects an unknown stageId target", () => {
    const state = buildState([{ kind: "saved" }, { kind: "applied" }], 1);
    expectFail(planMove(state, { stageId: "does-not-exist" }, NOW), "not_found");
  });
});

describe("planAddStage", () => {
  const openState = (): OpportunityState =>
    buildState([{ kind: "saved" }, { kind: "applied" }, { kind: "offer" }], 1);

  it("rejects on a closed opportunity", () => {
    const state = buildState([{ kind: "saved" }, { kind: "applied" }, { kind: "offer" }], 1, "closed");
    expectFail(planAddStage(state, "portfolio_case", "Take-home"), "closed");
  });

  for (const kind of ["saved", "applied", "offer"] as const) {
    it(`rejects adding another ${kind} stage`, () => {
      expectFail(planAddStage(openState(), kind, "Extra"), "fixed_stage");
    });
  }

  it("rejects a blank label", () => {
    expectFail(planAddStage(openState(), "portfolio_case", "   "), "label_required");
  });

  it("places a brand new kind right after the last earlier-kind stage", () => {
    const result = expectOk(planAddStage(openState(), "portfolio_case", "Take-home"));
    expect(result.create).toEqual({ kind: "portfolio_case", label: "Take-home" });
    expect(result.order).toEqual(["s0", "s1", NEW_STAGE, "s2"]);
  });

  it("places a second stage of an existing kind right after the first", () => {
    const state = buildState(
      [{ kind: "saved" }, { kind: "applied" }, { kind: "portfolio_case" }, { kind: "offer" }],
      1,
    );
    const result = expectOk(planAddStage(state, "portfolio_case", "Take-home"));
    expect(result.order).toEqual(["s0", "s1", "s2", NEW_STAGE, "s3"]);
  });
});

describe("planReorder", () => {
  const fiveStages = () =>
    buildState(
      [
        { kind: "saved" },
        { kind: "applied" },
        { kind: "recruiter_screen" },
        { kind: "hiring_manager" },
        { kind: "offer" },
      ],
      1,
    );

  it("rejects on a closed opportunity", () => {
    const state = buildState([{ kind: "saved" }, { kind: "applied" }, { kind: "offer" }], 1, "closed");
    expectFail(planReorder(state, ["s0", "s1", "s2"]), "closed");
  });

  it("rejects an order missing an id", () => {
    expectFail(planReorder(fiveStages(), ["s0", "s1", "s2", "s3"]), "invalid_order");
  });

  it("rejects an order with an unknown id", () => {
    expectFail(planReorder(fiveStages(), ["s0", "s1", "s2", "s3", "bogus"]), "invalid_order");
  });

  it("rejects an order with a duplicate id", () => {
    expectFail(planReorder(fiveStages(), ["s0", "s1", "s1", "s3", "s4"]), "invalid_order");
  });

  it("rejects an order that does not start with Saved", () => {
    expectFail(planReorder(fiveStages(), ["s1", "s0", "s2", "s3", "s4"]), "invalid_order");
  });

  it("rejects an order whose second stage is not Applied", () => {
    expectFail(planReorder(fiveStages(), ["s0", "s2", "s1", "s3", "s4"]), "invalid_order");
  });

  it("rejects an order that does not end with Offer", () => {
    expectFail(planReorder(fiveStages(), ["s0", "s1", "s4", "s3", "s2"]), "invalid_order");
  });

  it("accepts a permutation that keeps Saved first, Applied second and Offer last", () => {
    const order = ["s0", "s1", "s3", "s2", "s4"];
    const result = expectOk(planReorder(fiveStages(), order));
    expect(result.order).toEqual(order);
  });
});

describe("planRename", () => {
  it("rejects on a closed opportunity", () => {
    const state = buildState([{ kind: "saved" }, { kind: "applied" }], 1, "closed");
    expectFail(planRename(state, "s0", "New label"), "closed");
  });

  it("rejects an unknown stageId", () => {
    const state = buildState([{ kind: "saved" }, { kind: "applied" }], 1);
    expectFail(planRename(state, "bogus", "New label"), "not_found");
  });

  it("rejects a blank label", () => {
    const state = buildState([{ kind: "saved" }, { kind: "applied" }], 1);
    expectFail(planRename(state, "s1", "  "), "label_required");
  });

  it("allows renaming a fixed stage (Saved, Applied and Offer are not exempt from rename)", () => {
    const state = buildState([{ kind: "saved" }, { kind: "applied" }], 1);
    const patch = expectOk(planRename(state, "s0", "Long-listed"));
    expect(patch).toEqual({ id: "s0", label: "Long-listed" });
  });
});

describe("planSkip", () => {
  it("rejects on a closed opportunity", () => {
    const state = buildState([{ kind: "saved" }, { kind: "applied" }], 1, "closed");
    expectFail(planSkip(state, "s0"), "closed");
  });

  it("rejects an unknown stageId", () => {
    const state = buildState([{ kind: "saved" }, { kind: "applied" }], 1);
    expectFail(planSkip(state, "bogus"), "not_found");
  });

  it("rejects skipping the current stage", () => {
    const state = buildState([{ kind: "saved" }, { kind: "applied" }], 1);
    expectFail(planSkip(state, "s1"), "stage_current");
  });

  it("rejects skipping a done stage", () => {
    const state = buildState([{ kind: "saved", status: "done" }, { kind: "applied" }], 1);
    expectFail(planSkip(state, "s0"), "not_skippable");
  });

  it("rejects skipping an already-skipped stage", () => {
    const state = buildState(
      [{ kind: "saved" }, { kind: "applied" }, { kind: "recruiter_screen", status: "skipped" }],
      1,
    );
    expectFail(planSkip(state, "s2"), "not_skippable");
  });

  it("allows skipping an upcoming, non-current stage", () => {
    const state = buildState(
      [{ kind: "saved" }, { kind: "applied" }, { kind: "recruiter_screen" }],
      1,
    );
    expect(expectOk(planSkip(state, "s2"))).toEqual({ id: "s2", status: "skipped" });
  });

  it("allows skipping a scheduled, non-current stage", () => {
    const state = buildState(
      [
        { kind: "saved" },
        { kind: "applied" },
        { kind: "recruiter_screen", status: "scheduled", scheduledAt: FUTURE },
      ],
      1,
    );
    expect(expectOk(planSkip(state, "s2"))).toEqual({ id: "s2", status: "skipped" });
  });
});

describe("planUnskip", () => {
  it("rejects on a closed opportunity", () => {
    const state = buildState(
      [{ kind: "saved" }, { kind: "applied", status: "skipped" }],
      0,
      "closed",
    );
    expectFail(planUnskip(state, "s1", NOW), "closed");
  });

  it("rejects an unknown stageId", () => {
    const state = buildState([{ kind: "saved" }, { kind: "applied" }], 1);
    expectFail(planUnskip(state, "bogus", NOW), "not_found");
  });

  it("rejects a stage that is not skipped", () => {
    const state = buildState([{ kind: "saved" }, { kind: "applied" }], 1);
    expectFail(planUnskip(state, "s0", NOW), "not_skipped");
  });

  it("returns to upcoming when there is no scheduled date", () => {
    const state = buildState(
      [{ kind: "saved" }, { kind: "applied" }, { kind: "recruiter_screen", status: "skipped" }],
      1,
    );
    expect(expectOk(planUnskip(state, "s2", NOW))).toEqual({ id: "s2", status: "upcoming" });
  });

  it("returns to scheduled when the scheduled date is in the future", () => {
    const state = buildState(
      [
        { kind: "saved" },
        { kind: "applied" },
        { kind: "recruiter_screen", status: "skipped", scheduledAt: FUTURE },
      ],
      1,
    );
    expect(expectOk(planUnskip(state, "s2", NOW))).toEqual({ id: "s2", status: "scheduled" });
  });

  it("returns to upcoming when the scheduled date is in the past", () => {
    const state = buildState(
      [
        { kind: "saved" },
        { kind: "applied" },
        { kind: "recruiter_screen", status: "skipped", scheduledAt: PAST },
      ],
      1,
    );
    expect(expectOk(planUnskip(state, "s2", NOW))).toEqual({ id: "s2", status: "upcoming" });
  });
});

describe("planRemove", () => {
  const openState = () =>
    buildState(
      [{ kind: "saved" }, { kind: "applied" }, { kind: "recruiter_screen" }, { kind: "offer" }],
      1,
    );

  it("rejects on a closed opportunity", () => {
    const state = buildState([{ kind: "saved" }, { kind: "applied" }], 1, "closed");
    expectFail(planRemove(state, "s0"), "closed");
  });

  it("rejects an unknown stageId", () => {
    expectFail(planRemove(openState(), "bogus"), "not_found");
  });

  for (const [label, id] of [
    ["Saved", "s0"],
    ["Applied", "s1"],
    ["Offer", "s3"],
  ] as const) {
    it(`rejects removing ${label}`, () => {
      expectFail(planRemove(openState(), id), "fixed_stage");
    });
  }

  it("rejects removing the current stage", () => {
    // Deliberately not openState(): its current stage (s1, "applied") is
    // also a fixed kind, so it can only ever prove fixed_stage, never
    // stage_current in isolation (see the task report's contradiction
    // note). This fixture puts a flexible kind current instead.
    const state = buildState(
      [{ kind: "saved" }, { kind: "applied" }, { kind: "recruiter_screen" }, { kind: "offer" }],
      2,
    );
    expectFail(planRemove(state, "s2"), "stage_current");
  });

  it("rejects removing a done stage", () => {
    const state = buildState(
      [
        { kind: "saved" },
        { kind: "applied" },
        { kind: "recruiter_screen", status: "done" },
        { kind: "offer" },
      ],
      1,
    );
    expectFail(planRemove(state, "s2"), "stage_done");
  });

  it("rejects removing a stage with artifacts", () => {
    const state = buildState(
      [
        { kind: "saved" },
        { kind: "applied" },
        { kind: "recruiter_screen", hasArtifacts: true },
        { kind: "offer" },
      ],
      1,
    );
    expectFail(planRemove(state, "s2"), "stage_has_artifacts");
  });

  it("removes a flexible, non-current, non-done stage with no artifacts", () => {
    const result = expectOk(planRemove(openState(), "s2"));
    expect(result.order).toEqual(["s0", "s1", "s3"]);
  });
});
