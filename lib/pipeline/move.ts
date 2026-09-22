import type { Scoped } from "@/lib/db/scoped";
import { type Result, ok, fail } from "@/lib/result";
import { loadState } from "@/lib/pipeline/snapshot";
import { planMove, NEW_STAGE, type MoveTarget, type MoveError } from "@/lib/pipeline/rules";
import type { StageKind } from "@/lib/pipeline/kinds";

export async function moveOpportunity(
  s: Scoped,
  opportunityId: string,
  target: MoveTarget,
  now?: Date,
): Promise<
  Result<
    { from: { kind: StageKind; label: string }; to: { stageId: string; kind: StageKind; label: string } },
    MoveError
  >
> {
  const resolvedNow = now ?? new Date();

  return s.transaction(async (tx) => {
    const loaded = await loadState(tx, opportunityId);
    if (!loaded) {
      return fail("not_found", "This job no longer exists.");
    }

    const plan = planMove(loaded.state, target, resolvedNow);
    if (!plan.ok) {
      return plan;
    }

    let targetStageId: string;

    if (plan.data.create) {
      const maxPosition = Math.max(...loaded.state.stages.map((st) => st.position));
      const newStage = await tx.stage.insert({
        opportunityId,
        kind: plan.data.create.kind,
        label: plan.data.create.label,
        position: maxPosition + 1,
      });
      targetStageId = newStage.id;
      const realOrder = plan.data.order!.map((x) => (x === NEW_STAGE ? newStage.id : x));
      await tx.stage.renumber(opportunityId, realOrder);
    } else {
      // planMove only ever sets `to.stageId` to NEW_STAGE in the same case
      // where it also sets `create` (handled above), so outside that branch
      // this is always a real stage id.
      targetStageId = plan.data.to.stageId as string;
    }

    for (const patch of plan.data.patches) {
      const { id, ...fields } = patch;
      const resolvedId = id === NEW_STAGE ? targetStageId : id;
      await tx.stage.update(resolvedId, fields);
    }

    await tx.opportunity.update(opportunityId, { currentStageId: targetStageId });
    await tx.event.insert({
      opportunityId,
      stageId: targetStageId,
      kind: "stage_moved",
      occurredAt: resolvedNow,
      meta: { from: plan.data.from, to: { ...plan.data.to, stageId: targetStageId } },
    });

    return ok({
      from: plan.data.from,
      to: { stageId: targetStageId, kind: plan.data.to.kind, label: plan.data.to.label },
    });
  });
}
