import { STAGE_KINDS, type StageKind } from "@/lib/pipeline/kinds";
import type { StageStatus } from "@/lib/pipeline/values";
import type { OpportunityState, StageState } from "@/lib/pipeline/rules";

export type StageSpec = {
  kind: StageKind;
  label?: string;
  status?: StageStatus;
  scheduledAt?: Date | null;
  enteredAt?: Date | null;
  completedAt?: Date | null;
  hasArtifacts?: boolean;
};

export function buildState(
  specs: StageSpec[],
  currentIndex: number,
  status: "active" | "closed" = "active",
): OpportunityState {
  const stages: StageState[] = specs.map((spec, index) => ({
    id: `s${index}`,
    kind: spec.kind,
    label: spec.label ?? STAGE_KINDS.find((k) => k.kind === spec.kind)!.defaultLabel,
    position: index,
    status: spec.status ?? "upcoming",
    scheduledAt: spec.scheduledAt ?? null,
    enteredAt: spec.enteredAt ?? null,
    completedAt: spec.completedAt ?? null,
    hasArtifacts: spec.hasArtifacts ?? false,
  }));
  return { status, currentStageId: stages[currentIndex].id, stages };
}
