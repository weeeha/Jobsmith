import type { StageRow } from "@/lib/db/scoped";
import type { StageState } from "@/lib/pipeline/rules";
import type { StageKind } from "@/lib/pipeline/kinds";
import type { StageStatus } from "@/lib/pipeline/values";

export function toStageStates(rows: StageRow[], stagesWithArtifacts: ReadonlySet<string>): StageState[] {
  return rows
    .slice()
    .sort((a, b) => a.position - b.position)
    .map((row) => ({
      id: row.id,
      kind: row.kind as StageKind,
      label: row.label,
      position: row.position,
      status: row.status as StageStatus,
      scheduledAt: row.scheduledAt,
      enteredAt: row.enteredAt,
      completedAt: row.completedAt,
      hasArtifacts: stagesWithArtifacts.has(row.id),
    }));
}
