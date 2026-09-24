import type { Scoped } from "@/lib/db/scoped";
import { type Result, ok, fail } from "@/lib/result";
import { loadOrFail } from "@/lib/pipeline/snapshot";
import type { ClosedReason } from "@/lib/pipeline/values";

export async function closeOpportunity(
  s: Scoped,
  opportunityId: string,
  reason: ClosedReason,
  now?: Date,
): Promise<Result<null, "not_found" | "closed">> {
  const resolvedNow = now ?? new Date();

  return s.transaction(async (tx) => {
    const loaded = await loadOrFail(tx, opportunityId);
    if (!loaded.ok) {
      return loaded;
    }
    if (loaded.data.state.status === "closed") {
      return fail("closed", "This job is already closed.");
    }

    await tx.opportunity.update(opportunityId, {
      status: "closed",
      closedReason: reason,
      closedAt: resolvedNow,
      closedStageId: loaded.data.opportunity.currentStageId,
    });
    await tx.event.insert({
      opportunityId,
      kind: "closed",
      occurredAt: resolvedNow,
      meta: { reason },
    });

    return ok(null);
  });
}

export async function reopenOpportunity(
  s: Scoped,
  opportunityId: string,
  now?: Date,
): Promise<Result<null, "not_found" | "not_closed">> {
  const resolvedNow = now ?? new Date();

  return s.transaction(async (tx) => {
    const loaded = await loadOrFail(tx, opportunityId);
    if (!loaded.ok) {
      return loaded;
    }
    if (loaded.data.state.status !== "closed") {
      return fail("not_closed", "This job is not closed.");
    }

    await tx.opportunity.update(opportunityId, {
      status: "active",
      closedReason: null,
      closedAt: null,
      closedStageId: null,
    });
    await tx.event.insert({
      opportunityId,
      kind: "reopened",
      occurredAt: resolvedNow,
      meta: {},
    });

    return ok(null);
  });
}
