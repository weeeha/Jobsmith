import { describe, expect, it } from "vitest";
import { toStageStates } from "@/lib/pipeline/stage-state";
import type { StageRow } from "@/lib/db/scoped";

function stageRow(overrides: Partial<StageRow> & { id: string; position: number }): StageRow {
  return {
    userId: "u1",
    opportunityId: "o1",
    kind: "saved",
    label: "Saved",
    status: "upcoming",
    scheduledAt: null,
    format: null,
    enteredAt: null,
    completedAt: null,
    outcomeMd: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as StageRow;
}

describe("toStageStates", () => {
  it("sorts by position regardless of input order", () => {
    const rows = [stageRow({ id: "s1", position: 1 }), stageRow({ id: "s0", position: 0 })];
    expect(toStageStates(rows, new Set()).map((s) => s.id)).toEqual(["s0", "s1"]);
  });

  it("sets hasArtifacts true only for a stage id present in the set", () => {
    const rows = [stageRow({ id: "s0", position: 0 }), stageRow({ id: "s1", position: 1 })];
    const states = toStageStates(rows, new Set(["s1"]));
    expect(states.find((s) => s.id === "s0")?.hasArtifacts).toBe(false);
    expect(states.find((s) => s.id === "s1")?.hasArtifacts).toBe(true);
  });

  it("carries every other field straight through from the row", () => {
    const scheduledAt = new Date("2026-10-01T00:00:00Z");
    const rows = [stageRow({ id: "s0", position: 0, kind: "hiring_manager", label: "Custom label", status: "scheduled", scheduledAt })];
    const [state] = toStageStates(rows, new Set());
    expect(state).toMatchObject({ id: "s0", kind: "hiring_manager", label: "Custom label", status: "scheduled", scheduledAt });
  });
});
