"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth/session";
import { scopedFor, type Scoped } from "@/lib/db/scoped";
import { completeNextAction } from "@/lib/pipeline/next-action";
import { moveOpportunity } from "@/lib/pipeline/move";
import { opportunityIdSchema } from "@/lib/pipeline/action-schemas";
import { messageFor } from "@/lib/pipeline/messages";
import { snoozeInputSchema, snoozeItem } from "@/lib/attention/snooze";
import { fail, ok, type Result } from "@/lib/result";

// Home's three write actions. Each one goes through the pipeline's own write
// path (completeNextAction, moveOpportunity, setNextAction through
// snoozeItem), so Home never writes a stage or a next action any other way.

async function revalidateAfter(s: Scoped, opportunityId: string) {
  revalidatePath("/");
  revalidatePath("/board");
  const job = await s.opportunity.getById(opportunityId);
  if (job) revalidatePath(`/jobs/${job.slug}`);
}

export async function markDoneFromHomeAction(opportunityId: string): Promise<Result<null, string>> {
  const user = await requireUser();
  if (!opportunityIdSchema.safeParse(opportunityId).success) return fail("not_found", messageFor("not_found"));
  const s = scopedFor(user.id);
  const result = await completeNextAction(s, opportunityId);
  if (!result.ok) return fail(result.code, messageFor(result.code));
  await revalidateAfter(s, opportunityId);
  return ok(null);
}

export async function markAppliedFromHomeAction(opportunityId: string): Promise<Result<null, string>> {
  const user = await requireUser();
  if (!opportunityIdSchema.safeParse(opportunityId).success) return fail("not_found", messageFor("not_found"));
  const s = scopedFor(user.id);
  const result = await moveOpportunity(s, opportunityId, { kind: "applied" });
  if (!result.ok) return fail(result.code, messageFor(result.code));
  await revalidateAfter(s, opportunityId);
  return ok(null);
}

/** Returns the new next action date as an ISO string, for the "Snoozed to ..." toast. */
export async function snoozeFromHomeAction(input: unknown): Promise<Result<{ at: string }, string>> {
  const user = await requireUser();
  const parsed = snoozeInputSchema.safeParse(input);
  if (!parsed.success) return fail("invalid", messageFor("invalid"));
  const s = scopedFor(user.id);
  const result = await snoozeItem(s, parsed.data, new Date());
  if (!result.ok) return fail(result.code, messageFor(result.code));
  await revalidateAfter(s, parsed.data.opportunityId);
  return ok({ at: result.data.at.toISOString() });
}
