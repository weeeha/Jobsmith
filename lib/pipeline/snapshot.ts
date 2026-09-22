import type { Scoped, OpportunityRow } from "@/lib/db/scoped";
import type { OpportunityState, StageState } from "@/lib/pipeline/rules";
import type { StageKind } from "@/lib/pipeline/kinds";
import type { OpportunityStatus, StageStatus } from "@/lib/pipeline/values";

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
