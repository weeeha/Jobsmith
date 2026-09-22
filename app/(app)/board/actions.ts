"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth/session";
import { scopedFor, type Scoped } from "@/lib/db/scoped";
import { moveOpportunity } from "@/lib/pipeline/move";
import { closeOpportunity, reopenOpportunity } from "@/lib/pipeline/close";
import type { StageKind } from "@/lib/pipeline/kinds";
import type { MoveTarget, MoveError } from "@/lib/pipeline/rules";
import type { ClosedReason } from "@/lib/pipeline/values";
import { fail, type Result } from "@/lib/result";
import { messageFor } from "@/lib/pipeline/messages";
import { opportunityIdSchema, moveTargetSchema, closedReasonSchema } from "@/lib/pipeline/action-schemas";

// Every board action concerns exactly one opportunity, which may also be
// open as a job page in another tab, so both routes are revalidated
// (Task 6's action convention). The job's slug is not part of any of these
// actions' own return values, so it is re-read here; a not-found id simply
// yields no second revalidation.
async function revalidateBoardAndJob(s: Scoped, opportunityId: string) {
  revalidatePath("/board");
  const opportunity = await s.opportunity.getById(opportunityId);
  if (opportunity) revalidatePath(`/jobs/${opportunity.slug}`);
}

export async function moveAction(
  opportunityId: string,
  target: MoveTarget,
): Promise<
  Result<
    { from: { kind: StageKind; label: string }; to: { stageId: string; kind: StageKind; label: string } },
    MoveError
  >
> {
  const user = await requireUser();
  const idParsed = opportunityIdSchema.safeParse(opportunityId);
  const targetParsed = moveTargetSchema.safeParse(target);
  if (!idParsed.success || !targetParsed.success) {
    return fail("not_found", messageFor("not_found"));
  }
  const s = scopedFor(user.id);
  const result = await moveOpportunity(s, idParsed.data, targetParsed.data);
  await revalidateBoardAndJob(s, idParsed.data);
  return result;
}

export async function closeAction(
  opportunityId: string,
  reason: ClosedReason,
): Promise<Result<null, "not_found" | "closed">> {
  const user = await requireUser();
  const idParsed = opportunityIdSchema.safeParse(opportunityId);
  const reasonParsed = closedReasonSchema.safeParse(reason);
  if (!idParsed.success || !reasonParsed.success) {
    return fail("not_found", messageFor("not_found"));
  }
  const s = scopedFor(user.id);
  const result = await closeOpportunity(s, idParsed.data, reasonParsed.data);
  await revalidateBoardAndJob(s, idParsed.data);
  return result;
}

export async function reopenAction(opportunityId: string): Promise<Result<null, "not_found" | "not_closed">> {
  const user = await requireUser();
  const idParsed = opportunityIdSchema.safeParse(opportunityId);
  if (!idParsed.success) {
    return fail("not_found", messageFor("not_found"));
  }
  const s = scopedFor(user.id);
  const result = await reopenOpportunity(s, idParsed.data);
  await revalidateBoardAndJob(s, idParsed.data);
  return result;
}
