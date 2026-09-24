import type { StageKind } from "./kinds";
import { STAGE_KINDS } from "./kinds";
import type { StageStatus } from "./values";
import { type Result, ok, fail } from "@/lib/result";

export type StageState = {
  id: string;
  kind: StageKind;
  label: string;
  position: number;
  status: StageStatus;
  scheduledAt: Date | null;
  enteredAt: Date | null;
  completedAt: Date | null;
  hasArtifacts: boolean;
};

export type OpportunityState = { status: "active" | "closed"; currentStageId: string; stages: StageState[] };

export type MoveTarget = { stageId: string } | { kind: StageKind };

export const NEW_STAGE = "new" as const;

export type StagePatch = {
  id: string | typeof NEW_STAGE;
  status?: StageStatus;
  enteredAt?: Date;
  completedAt?: Date | null;
  label?: string;
};

export type StageDraft = { kind: StageKind; label: string };

export type MovePlan = {
  create: StageDraft | null;
  order: (string | typeof NEW_STAGE)[] | null;
  patches: StagePatch[];
  currentStageId: string | typeof NEW_STAGE;
  from: { stageId: string; kind: StageKind; label: string };
  to: { stageId: string | typeof NEW_STAGE; kind: StageKind; label: string };
};

export type MoveError = "closed" | "not_found" | "same_stage" | "same_column";

export type EditError =
  | "closed"
  | "not_found"
  | "fixed_stage"
  | "stage_current"
  | "stage_done"
  | "stage_has_artifacts"
  | "invalid_order"
  | "label_required"
  | "not_skippable"
  | "not_skipped";

const FIXED_KINDS = new Set<StageKind>(["saved", "applied", "offer"]);

function kindRank(kind: StageKind): number {
  return STAGE_KINDS.findIndex((k) => k.kind === kind);
}

function isFuture(date: Date | null, now: Date): boolean {
  return date !== null && date.getTime() > now.getTime();
}

export function defaultStages(): StageDraft[] {
  return STAGE_KINDS.map((k) => ({ kind: k.kind, label: k.defaultLabel }));
}

export function placementIndex(stages: StageState[], kind: StageKind): number {
  let lastSameKind = -1;
  for (let i = 0; i < stages.length; i++) {
    if (stages[i].kind === kind) lastSameKind = i;
  }
  if (lastSameKind !== -1) return lastSameKind + 1;

  const targetRank = kindRank(kind);
  let lastEarlier = -1;
  for (let i = 0; i < stages.length; i++) {
    if (kindRank(stages[i].kind) < targetRank) lastEarlier = i;
  }
  if (lastEarlier !== -1) return lastEarlier + 1;

  return 0;
}

export function nextStageId(state: OpportunityState): string | null {
  const currentIndex = state.stages.findIndex((s) => s.id === state.currentStageId);
  for (let i = currentIndex + 1; i < state.stages.length; i++) {
    if (state.stages[i].status !== "skipped") return state.stages[i].id;
  }
  return null;
}

export function planMove(state: OpportunityState, target: MoveTarget, now: Date): Result<MovePlan, MoveError> {
  if (state.status === "closed") {
    return fail("closed", "This job is closed. Reopen it first.");
  }

  const currentIndex = state.stages.findIndex((s) => s.id === state.currentStageId);
  const currentStage = state.stages[currentIndex];

  let targetIndex: number;
  let targetId: string | typeof NEW_STAGE;
  let targetKind: StageKind;
  let targetLabel: string;
  let create: StageDraft | null = null;

  if ("stageId" in target) {
    if (target.stageId === state.currentStageId) {
      return fail("same_stage", "It is already in this stage.");
    }
    const idx = state.stages.findIndex((s) => s.id === target.stageId);
    if (idx === -1) {
      return fail("not_found", "This job no longer exists.");
    }
    const found = state.stages[idx];
    targetIndex = idx;
    targetId = found.id;
    targetKind = found.kind;
    targetLabel = found.label;
  } else {
    if (target.kind === currentStage.kind) {
      return fail("same_column", "It is already in this column.");
    }
    const sameKind = state.stages
      .map((stage, index) => ({ stage, index }))
      .filter((entry) => entry.stage.kind === target.kind);

    if (sameKind.length === 0) {
      const defaultLabel = STAGE_KINDS.find((k) => k.kind === target.kind)!.defaultLabel;
      create = { kind: target.kind, label: defaultLabel };
      targetIndex = placementIndex(state.stages, target.kind);
      targetId = NEW_STAGE;
      targetKind = target.kind;
      targetLabel = defaultLabel;
    } else {
      const chosen = sameKind.find((entry) => entry.stage.status !== "skipped") ?? sameKind[0];
      targetIndex = chosen.index;
      targetId = chosen.stage.id;
      targetKind = chosen.stage.kind;
      targetLabel = chosen.stage.label;
    }
  }

  const forward = targetIndex > currentIndex;
  const patches: StagePatch[] = [];

  if (forward) {
    patches.push({ id: currentStage.id, status: "done", completedAt: now });
    for (let i = currentIndex + 1; i < targetIndex; i++) {
      const stage = state.stages[i];
      if (stage.status === "upcoming") {
        patches.push({ id: stage.id, status: "skipped" });
      }
    }
  } else {
    // For a newly created stage, "just after the target" in the eventual
    // (post-insert) array is the same OLD array index as the insert point
    // itself: inserting at targetIndex shifts everything from there on one
    // slot later, so the old stage that used to sit at targetIndex is the
    // first one that now needs resetting.
    const start = create ? targetIndex : targetIndex + 1;
    for (let i = start; i <= currentIndex; i++) {
      const stage = state.stages[i];
      const status: StageStatus = isFuture(stage.scheduledAt, now) ? "scheduled" : "upcoming";
      patches.push({ id: stage.id, status, completedAt: null });
    }
  }

  if (create) {
    // A brand new stage is never done or skipped, so it never needs a
    // status reset: it only ever needs `enteredAt`.
    patches.push({ id: NEW_STAGE, enteredAt: now });
  } else {
    const stage = state.stages[targetIndex];
    const patch: StagePatch = { id: stage.id };
    let changed = false;
    if (stage.status === "done" || stage.status === "skipped") {
      patch.status = isFuture(stage.scheduledAt, now) ? "scheduled" : "upcoming";
      patch.completedAt = null;
      changed = true;
    }
    if (stage.enteredAt === null) {
      patch.enteredAt = now;
      changed = true;
    }
    if (changed) {
      patches.push(patch);
    }
  }

  let order: (string | typeof NEW_STAGE)[] | null = null;
  if (create) {
    order = state.stages.map((s) => s.id);
    order.splice(targetIndex, 0, NEW_STAGE);
  }

  return ok({
    create,
    order,
    patches,
    currentStageId: create ? NEW_STAGE : targetId,
    from: { stageId: currentStage.id, kind: currentStage.kind, label: currentStage.label },
    to: { stageId: targetId, kind: targetKind, label: targetLabel },
  });
}

export function planAddStage(
  state: OpportunityState,
  kind: StageKind,
  label: string,
): Result<{ create: StageDraft; order: (string | typeof NEW_STAGE)[] }, EditError> {
  if (state.status === "closed") {
    return fail("closed", "This job is closed. Reopen it first.");
  }
  if (FIXED_KINDS.has(kind)) {
    return fail("fixed_stage", "Saved, Applied and Offer always stay.");
  }
  const trimmed = label.trim();
  if (trimmed.length === 0) {
    return fail("label_required", "Give the stage a name.");
  }
  const index = placementIndex(state.stages, kind);
  const order: (string | typeof NEW_STAGE)[] = state.stages.map((s) => s.id);
  order.splice(index, 0, NEW_STAGE);
  return ok({ create: { kind, label: trimmed }, order });
}

export function planReorder(
  state: OpportunityState,
  orderedIds: string[],
): Result<{ order: string[] }, EditError> {
  if (state.status === "closed") {
    return fail("closed", "This job is closed. Reopen it first.");
  }

  const currentIds = state.stages.map((s) => s.id);
  const isPermutation =
    orderedIds.length === currentIds.length &&
    new Set(orderedIds).size === orderedIds.length &&
    orderedIds.every((id) => currentIds.includes(id));

  if (!isPermutation) {
    return fail("invalid_order", "That order is not allowed.");
  }

  const byId = new Map(state.stages.map((s) => [s.id, s]));
  const first = byId.get(orderedIds[0]);
  const second = byId.get(orderedIds[1]);
  const last = byId.get(orderedIds[orderedIds.length - 1]);

  if (first?.kind !== "saved" || second?.kind !== "applied" || last?.kind !== "offer") {
    return fail("invalid_order", "That order is not allowed.");
  }

  return ok({ order: orderedIds });
}

export function planRename(
  state: OpportunityState,
  stageId: string,
  label: string,
): Result<StagePatch, EditError> {
  if (state.status === "closed") {
    return fail("closed", "This job is closed. Reopen it first.");
  }
  const stage = state.stages.find((s) => s.id === stageId);
  if (!stage) {
    return fail("not_found", "This job no longer exists.");
  }
  const trimmed = label.trim();
  if (trimmed.length === 0) {
    return fail("label_required", "Give the stage a name.");
  }
  return ok({ id: stageId, label: trimmed });
}

export function planSkip(state: OpportunityState, stageId: string): Result<StagePatch, EditError> {
  if (state.status === "closed") {
    return fail("closed", "This job is closed. Reopen it first.");
  }
  const stage = state.stages.find((s) => s.id === stageId);
  if (!stage) {
    return fail("not_found", "This job no longer exists.");
  }
  if (stageId === state.currentStageId) {
    return fail("stage_current", "This is the current stage.");
  }
  if (stage.status !== "upcoming" && stage.status !== "scheduled") {
    return fail("not_skippable", "Only upcoming stages can be skipped.");
  }
  return ok({ id: stageId, status: "skipped" });
}

export function planUnskip(
  state: OpportunityState,
  stageId: string,
  now: Date,
): Result<StagePatch, EditError> {
  if (state.status === "closed") {
    return fail("closed", "This job is closed. Reopen it first.");
  }
  const stage = state.stages.find((s) => s.id === stageId);
  if (!stage) {
    return fail("not_found", "This job no longer exists.");
  }
  if (stage.status !== "skipped") {
    return fail("not_skipped", "This stage is not skipped.");
  }
  const status: StageStatus = isFuture(stage.scheduledAt, now) ? "scheduled" : "upcoming";
  return ok({ id: stageId, status });
}

export function planRemove(state: OpportunityState, stageId: string): Result<{ order: string[] }, EditError> {
  if (state.status === "closed") {
    return fail("closed", "This job is closed. Reopen it first.");
  }
  const stage = state.stages.find((s) => s.id === stageId);
  if (!stage) {
    return fail("not_found", "This job no longer exists.");
  }
  if (FIXED_KINDS.has(stage.kind)) {
    return fail("fixed_stage", "Saved, Applied and Offer always stay.");
  }
  if (stageId === state.currentStageId) {
    return fail("stage_current", "This is the current stage.");
  }
  if (stage.status === "done") {
    return fail("stage_done", "A finished stage stays in the history.");
  }
  if (stage.hasArtifacts) {
    return fail("stage_has_artifacts", "This stage has documents.");
  }
  const order = state.stages.filter((s) => s.id !== stageId).map((s) => s.id);
  return ok({ order });
}
