import type { Scoped } from "@/lib/db/scoped";
import { type Result, ok } from "@/lib/result";
import { loadOrFail } from "@/lib/pipeline/snapshot";
import {
  planAddStage,
  planRename,
  planReorder,
  planSkip,
  planUnskip,
  planRemove,
  NEW_STAGE,
  type EditError,
} from "@/lib/pipeline/rules";
import type { StageKind } from "@/lib/pipeline/kinds";

// All six functions share one shape: load state inside a transaction, call
// the matching rule from lib/pipeline/rules.ts, apply exactly what it
// returns, done. None of them write an event (stage edits write no events in
// this milestone), and none of them decide anything the rule didn't already
// decide.

export async function addStage(
  s: Scoped,
  opportunityId: string,
  kind: StageKind,
  label: string,
): Promise<Result<{ stageId: string }, EditError>> {
  return s.transaction(async (tx) => {
    const loaded = await loadOrFail(tx, opportunityId);
    if (!loaded.ok) {
      return loaded;
    }

    const result = planAddStage(loaded.data.state, kind, label);
    if (!result.ok) {
      return result;
    }

    // Positions are contiguous 0..n-1, so the stage count is the next free
    // slot; renumber() immediately below reassigns every position anyway.
    const maxPosition = loaded.data.state.stages.length;
    const newStage = await tx.stage.insert({
      opportunityId,
      kind: result.data.create.kind,
      label: result.data.create.label,
      position: maxPosition,
    });

    const realOrder = result.data.order.map((x) => (x === NEW_STAGE ? newStage.id : x));
    await tx.stage.renumber(opportunityId, realOrder);

    return ok({ stageId: newStage.id });
  });
}

export async function renameStage(
  s: Scoped,
  opportunityId: string,
  stageId: string,
  label: string,
): Promise<Result<null, EditError>> {
  return s.transaction(async (tx) => {
    const loaded = await loadOrFail(tx, opportunityId);
    if (!loaded.ok) {
      return loaded;
    }

    const result = planRename(loaded.data.state, stageId, label);
    if (!result.ok) {
      return result;
    }

    await tx.stage.update(stageId, { label: result.data.label });
    return ok(null);
  });
}

export async function reorderStages(
  s: Scoped,
  opportunityId: string,
  orderedIds: string[],
): Promise<Result<null, EditError>> {
  return s.transaction(async (tx) => {
    const loaded = await loadOrFail(tx, opportunityId);
    if (!loaded.ok) {
      return loaded;
    }

    const result = planReorder(loaded.data.state, orderedIds);
    if (!result.ok) {
      return result;
    }

    await tx.stage.renumber(opportunityId, result.data.order);
    return ok(null);
  });
}

export async function skipStage(
  s: Scoped,
  opportunityId: string,
  stageId: string,
): Promise<Result<null, EditError>> {
  return s.transaction(async (tx) => {
    const loaded = await loadOrFail(tx, opportunityId);
    if (!loaded.ok) {
      return loaded;
    }

    const result = planSkip(loaded.data.state, stageId);
    if (!result.ok) {
      return result;
    }

    await tx.stage.update(stageId, { status: result.data.status });
    return ok(null);
  });
}

export async function unskipStage(
  s: Scoped,
  opportunityId: string,
  stageId: string,
  now?: Date,
): Promise<Result<null, EditError>> {
  const resolvedNow = now ?? new Date();

  return s.transaction(async (tx) => {
    const loaded = await loadOrFail(tx, opportunityId);
    if (!loaded.ok) {
      return loaded;
    }

    const result = planUnskip(loaded.data.state, stageId, resolvedNow);
    if (!result.ok) {
      return result;
    }

    await tx.stage.update(stageId, { status: result.data.status });
    return ok(null);
  });
}

export async function removeStage(
  s: Scoped,
  opportunityId: string,
  stageId: string,
): Promise<Result<null, EditError>> {
  return s.transaction(async (tx) => {
    const loaded = await loadOrFail(tx, opportunityId);
    if (!loaded.ok) {
      return loaded;
    }

    const result = planRemove(loaded.data.state, stageId);
    if (!result.ok) {
      return result;
    }

    await tx.stage.remove(stageId);
    await tx.stage.renumber(opportunityId, result.data.order);
    return ok(null);
  });
}
