import type { Scoped, OpportunityRow } from "@/lib/db/scoped";
import type { OpportunityState, StageState } from "@/lib/pipeline/rules";
import type { StageKind } from "@/lib/pipeline/kinds";
import type { OpportunityStatus, StageStatus } from "@/lib/pipeline/values";
import { type Result, ok, fail } from "@/lib/result";

export async function loadState(
  s: Scoped,
  opportunityId: string,
): Promise<{ opportunity: OpportunityRow; state: OpportunityState } | null> {
  const row = await s.opportunity.lockById(opportunityId);
  if (!row) return null;

  const rows = await s.stage.listForOpportunity(opportunityId);
  const stages: StageState[] = rows.map((row) => ({
    id: row.id,
    kind: row.kind as StageKind,
    label: row.label,
    position: row.position,
    status: row.status as StageStatus,
    scheduledAt: row.scheduledAt,
    enteredAt: row.enteredAt,
    completedAt: row.completedAt,
    hasArtifacts: false,
  }));

  // Non-null assertion: every opportunity gets a currentStageId at creation
  // (createOpportunity) and it is never cleared afterward. The column is
  // nullable only for the circular-pointer FK mechanics (D2), not because a
  // real opportunity can lack a current stage.
  const state: OpportunityState = {
    status: row.status as OpportunityStatus,
    currentStageId: row.currentStageId!,
    stages,
  };

  return { opportunity: row, state };
}

// Every pipeline command (move/close/reopen/stage-edit) opens with the same
// load-and-guard: lock the opportunity row, and fail with "not_found" if it
// doesn't exist (or belongs to another tenant, which looks identical by
// design). Shared here so that block exists exactly once; it only loads and
// guards, it never absorbs rule logic. Callers must pass a transaction's own
// `tx` (never the outer `s`), same as `loadState` itself, so the lock this
// takes is inside the same transaction as the snapshot read, in the same
// order as before.
export async function loadOrFail(
  tx: Scoped,
  opportunityId: string,
): Promise<Result<{ opportunity: OpportunityRow; state: OpportunityState }, "not_found">> {
  const loaded = await loadState(tx, opportunityId);
  if (!loaded) {
    return fail("not_found", "This job no longer exists.");
  }
  return ok(loaded);
}
