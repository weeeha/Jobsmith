import { describe, expect, it } from "vitest";
import { toOpportunityState, stageControlsFor } from "@/lib/pipeline/stage-controls";
import type { JobView } from "@/lib/pipeline/read";
import type { OpportunityRow, StageRow } from "@/lib/db/scoped";

const NOW = new Date("2026-09-19T12:00:00.000Z");

function stageRow(overrides: Partial<StageRow> & { id: string; kind: StageRow["kind"]; position: number }): StageRow {
  return {
    userId: "u1",
    opportunityId: "o1",
    label: overrides.kind,
    status: "upcoming",
    scheduledAt: null,
    format: null,
    enteredAt: null,
    completedAt: null,
    outcomeMd: null,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  } as StageRow;
}

const sevenStages: StageRow[] = [
  stageRow({ id: "s0", kind: "saved", position: 0, enteredAt: NOW }),
  stageRow({ id: "s1", kind: "applied", position: 1 }),
  stageRow({ id: "s2", kind: "recruiter_screen", position: 2 }),
  stageRow({ id: "s3", kind: "hiring_manager", position: 3 }),
  stageRow({ id: "s4", kind: "portfolio_case", position: 4 }),
  stageRow({ id: "s5", kind: "panel_final", position: 5 }),
  stageRow({ id: "s6", kind: "offer", position: 6 }),
];

function view(stages: StageRow[], currentStageId: string): Pick<JobView, "opportunity" | "stages"> {
  return {
    opportunity: { id: "o1", status: "active", currentStageId } as OpportunityRow,
    stages,
  };
}

describe("toOpportunityState", () => {
  it("maps stage rows into rule-shaped stage state, hasArtifacts always false", () => {
    const state = toOpportunityState(view(sevenStages, "s0"));
    expect(state.status).toBe("active");
    expect(state.currentStageId).toBe("s0");
    expect(state.stages).toHaveLength(7);
    expect(state.stages[0]).toMatchObject({ id: "s0", kind: "saved", position: 0, hasArtifacts: false });
  });
});

describe("stageControlsFor", () => {
  it("pins Saved, Applied and Offer in both directions and disallows removing them", () => {
    const state = toOpportunityState(view(sevenStages, "s0"));
    const controls = stageControlsFor(state, NOW);
    for (const id of ["s0", "s1", "s6"]) {
      expect(controls[id]!.moveUp).toEqual({ allowed: false, reason: "That order is not allowed." });
      expect(controls[id]!.moveDown).toEqual({ allowed: false, reason: "That order is not allowed." });
      expect(controls[id]!.remove).toEqual({ allowed: false, reason: "Saved, Applied and Offer always stay." });
    }
  });

  it("lets a middle stage move down but not up when its upward neighbor is fixed", () => {
    const state = toOpportunityState(view(sevenStages, "s0"));
    const controls = stageControlsFor(state, NOW);
    expect(controls["s2"]!.moveUp).toEqual({ allowed: false, reason: "That order is not allowed." });
    expect(controls["s2"]!.moveDown).toEqual({ allowed: true });
    expect(controls["s2"]!.remove).toEqual({ allowed: true });
  });

  it("disables skip and remove for the current stage", () => {
    const state = toOpportunityState(view(sevenStages, "s2"));
    const controls = stageControlsFor(state, NOW);
    expect(controls["s2"]!.skip).toEqual({ allowed: false, reason: "This is the current stage." });
    expect(controls["s2"]!.remove).toEqual({ allowed: false, reason: "This is the current stage." });
  });

  it("offers Unskip instead of Skip once a stage is skipped", () => {
    const skipped = sevenStages.map((s) => (s.id === "s3" ? { ...s, status: "skipped" as const } : s));
    const state = toOpportunityState(view(skipped, "s0"));
    const controls = stageControlsFor(state, NOW);
    expect(controls["s3"]!.skip).toEqual({ allowed: true });
    const notSkipped = toOpportunityState(view(sevenStages, "s0"));
    expect(stageControlsFor(notSkipped, NOW)["s3"]!.skip).toEqual({ allowed: true });
  });

  it("disables remove for a done stage", () => {
    const done = sevenStages.map((s) => (s.id === "s2" ? { ...s, status: "done" as const } : s));
    const state = toOpportunityState(view(done, "s3"));
    const controls = stageControlsFor(state, NOW);
    expect(controls["s2"]!.remove).toEqual({ allowed: false, reason: "A finished stage stays in the history." });
  });
});
