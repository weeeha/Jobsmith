import { z } from "zod";
import type { Scoped } from "@/lib/db/scoped";
import { type Result, ok, fail } from "@/lib/result";

export const addNoteSchema = z.object({
  body: z.string().trim().min(1, "Enter a note."),
});

export async function addNote(
  s: Scoped,
  opportunityId: string,
  body: string,
  now?: Date,
): Promise<Result<{ eventId: string }, "not_found" | "invalid">> {
  const parsed = addNoteSchema.safeParse({ body });
  if (!parsed.success) {
    return fail("invalid", parsed.error.issues[0]?.message ?? "That is not valid.");
  }

  const row = await s.opportunity.getById(opportunityId);
  if (!row) {
    return fail("not_found", "This job no longer exists.");
  }

  const resolvedNow = now ?? new Date();
  const eventRow = await s.event.insert({
    opportunityId,
    kind: "note",
    body: parsed.data.body.trim(),
    occurredAt: resolvedNow,
    meta: {},
  });

  return ok({ eventId: eventRow.id });
}
