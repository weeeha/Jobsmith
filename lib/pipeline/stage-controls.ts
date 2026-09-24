import type { OpportunityState } from "@/lib/pipeline/rules";
import { planRemove, planSkip, planUnskip, planReorder } from "@/lib/pipeline/rules";
import { messageFor } from "@/lib/pipeline/messages";
import type { JobView } from "@/lib/pipeline/read";
import { toStageStates } from "@/lib/pipeline/stage-state";
import { stagesWithArtifacts } from "@/lib/artifacts/tabs";

export type StageControl = { allowed: true } | { allowed: false; reason: string };
export type StageControls = { remove: StageControl; skip: StageControl; moveUp: StageControl; moveDown: StageControl };

export function toOpportunityState(view: Pick<JobView, "opportunity" | "stages" | "documents">): OpportunityState {
  const stages = toStageStates(view.stages, stagesWithArtifacts(view.documents));
  return {
    status: view.opportunity.status,
    // Non-null assertion: mirrors loadState's own — every real opportunity
    // has a currentStageId from creation onward.
    currentStageId: view.opportunity.currentStageId!,
    stages,
  };
}

function fromResult(result: { ok: true; data: unknown } | { ok: false; code: string; message: string }): StageControl {
  return result.ok ? { allowed: true } : { allowed: false, reason: messageFor(result.code) };
}

function reorderCheck(
  state: OpportunityState,
  orderedIds: string[],
  index: number,
  direction: "up" | "down",
): StageControl {
  const neighbor = direction === "up" ? index - 1 : index + 1;
  if (neighbor < 0 || neighbor >= orderedIds.length) {
    return { allowed: false, reason: messageFor("invalid_order") };
  }
  const candidate = orderedIds.slice();
  const a = candidate[index]!;
  const b = candidate[neighbor]!;
  candidate[index] = b;
  candidate[neighbor] = a;
  return fromResult(planReorder(state, candidate));
}

export function stageControlsFor(state: OpportunityState, now: Date): Record<string, StageControls> {
  const orderedIds = state.stages.map((s) => s.id);
  const result: Record<string, StageControls> = {};
  state.stages.forEach((stage, index) => {
    const skipOrUnskip = stage.status === "skipped" ? planUnskip(state, stage.id, now) : planSkip(state, stage.id);
    result[stage.id] = {
      remove: fromResult(planRemove(state, stage.id)),
      skip: fromResult(skipOrUnskip),
      moveUp: reorderCheck(state, orderedIds, index, "up"),
      moveDown: reorderCheck(state, orderedIds, index, "down"),
    };
  });
  return result;
}
