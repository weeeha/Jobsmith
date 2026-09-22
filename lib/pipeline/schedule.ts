import type { Scoped } from "@/lib/db/scoped";
import { type Result, ok, fail } from "@/lib/result";
import { loadOrFail } from "@/lib/pipeline/snapshot";
import type { StageFormat, StageStatus } from "@/lib/pipeline/values";

export async function scheduleStage(
  s: Scoped,
  opportunityId: string,
  stageId: string,
  input: { scheduledAt: Date | null; format: StageFormat | null },
  now?: Date,
): Promise<Result<null, "not_found" | "closed">> {
  const resolvedNow = now ?? new Date();

  return s.transaction(async (tx) => {
    const loaded = await loadOrFail(tx, opportunityId);
    if (!loaded.ok) {
      return loaded;
    }
    if (loaded.data.state.status === "closed") {
      return fail("closed", "This job is closed. Reopen it first.");
    }

    const stage = loaded.data.state.stages.find((st) => st.id === stageId);
    if (!stage) {
      return fail("not_found", "That stage does not belong to this job.");
    }

    const isFuture = input.scheduledAt !== null && input.scheduledAt.getTime() > resolvedNow.getTime();
    const becomesScheduled = stage.status === "upcoming" && isFuture;
    const returnsToUpcoming = stage.status === "scheduled" && input.scheduledAt === null;
    const newStatus: StageStatus = becomesScheduled ? "scheduled" : returnsToUpcoming ? "upcoming" : stage.status;

    await tx.stage.update(stageId, { scheduledAt: input.scheduledAt, format: input.format, status: newStatus });

    if (becomesScheduled) {
      // isFuture already proved input.scheduledAt is non-null in this branch.
      await tx.event.insert({
        opportunityId,
        stageId,
        kind: "interview_scheduled",
        occurredAt: resolvedNow,
        meta: { stageLabel: stage.label, scheduledAt: input.scheduledAt!.toISOString(), format: input.format },
      });
    }

    return ok(null);
  });
}

export async function setStageOutcome(
  s: Scoped,
  opportunityId: string,
  stageId: string,
  outcomeMd: string,
): Promise<Result<null, "not_found">> {
  const stages = await s.stage.listForOpportunity(opportunityId);
  const stage = stages.find((st) => st.id === stageId);
  if (!stage) {
    return fail("not_found", "That stage does not belong to this job.");
  }

  await s.stage.update(stageId, { outcomeMd });
  return ok(null);
}
