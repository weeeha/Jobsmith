import type { Scoped } from "@/lib/db/scoped";
import { type Result, ok, fail } from "@/lib/result";
import type { PrepMode } from "./values";

export async function startSession(
  s: Scoped,
  input: {
    opportunityId: string | null;
    mode: PrepMode;
    questions: number;
    meta?: Record<string, unknown>;
    now?: Date;
  },
): Promise<Result<{ id: string }, "not_found">> {
  if (input.opportunityId !== null) {
    const opportunity = await s.opportunity.getById(input.opportunityId);
    if (!opportunity) return fail("not_found", "This job no longer exists.");
  }
  // `questions` is the planned count here and becomes the number seen at the end.
  const row = await s.prepSession.insert({
    opportunityId: input.opportunityId,
    mode: input.mode,
    startedAt: input.now ?? new Date(),
    questions: input.questions,
    meta: input.meta ?? {},
  });
  return ok({ id: row.id });
}

function eventBody(seen: number, solid: number): string {
  return `Drilled ${seen} ${seen === 1 ? "question" : "questions"}, ${solid} marked solid`;
}

// A session ends once. Only Drill and Quick-fire on a job leave an event.
export async function endSession(
  s: Scoped,
  input: { id: string; seen: number; marked: number; solid: number; now?: Date },
): Promise<Result<{ eventWritten: boolean }, "not_found">> {
  return s.transaction(async (tx) => {
    const session = await tx.prepSession.getById(input.id);
    if (!session) return fail("not_found", "This session no longer exists.");
    if (session.endedAt !== null) return ok({ eventWritten: false });

    const now = input.now ?? new Date();
    // Guarded on ended_at being null: a second simultaneous call updates nothing and writes no event.
    const ended = await tx.prepSession.endIfOpen(session.id, { endedAt: now, questions: input.seen, marked: input.marked });
    if (!ended) return ok({ eventWritten: false });

    const writesEvent = session.opportunityId !== null && (session.mode === "drill" || session.mode === "quick_fire");
    if (!writesEvent || session.opportunityId === null) return ok({ eventWritten: false });

    await tx.event.insert({
      opportunityId: session.opportunityId,
      kind: "prep_drilled",
      body: eventBody(input.seen, input.solid),
      occurredAt: now,
      meta: { sessionId: session.id, mode: session.mode, seen: input.seen, marked: input.marked, solid: input.solid },
    });
    return ok({ eventWritten: true });
  });
}
