import { z } from "zod";
import type { Scoped } from "@/lib/db/scoped";
import { type Result, ok, fail } from "@/lib/result";

export const setNextActionSchema = z.object({
  text: z.string().trim().min(1),
  at: z.date().nullable(),
});

export async function setNextAction(
  s: Scoped,
  opportunityId: string,
  input: { text: string; at: Date | null },
): Promise<Result<null, "not_found" | "invalid">> {
  const parsed = setNextActionSchema.safeParse(input);
  if (!parsed.success) {
    return fail("invalid", parsed.error.issues[0]?.message ?? "That is not valid.");
  }

  const row = await s.opportunity.getById(opportunityId);
  if (!row) {
    return fail("not_found", "This job no longer exists.");
  }

  await s.opportunity.update(opportunityId, { nextAction: parsed.data.text.trim(), nextActionAt: parsed.data.at });
  return ok(null);
}

export async function completeNextAction(
  s: Scoped,
  opportunityId: string,
  now?: Date,
): Promise<Result<null, "not_found" | "nothing_to_complete">> {
  const resolvedNow = now ?? new Date();

  return s.transaction(async (tx) => {
    const row = await tx.opportunity.lockById(opportunityId);
    if (!row) {
      return fail("not_found", "This job no longer exists.");
    }
    if (row.nextAction === null) {
      return fail("nothing_to_complete", "There is no next action to complete.");
    }

    await tx.event.insert({
      opportunityId,
      kind: "next_action_done",
      body: row.nextAction,
      occurredAt: resolvedNow,
      meta: {},
    });
    await tx.opportunity.update(opportunityId, { nextAction: null, nextActionAt: null });

    return ok(null);
  });
}
