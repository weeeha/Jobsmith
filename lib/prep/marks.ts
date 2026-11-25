import { z } from "zod";
import type { Scoped } from "@/lib/db/scoped";
import { type Result, ok, fail } from "@/lib/result";
import { MARK_LEVELS, MARK_SCOPES, type MarkLevel } from "./values";

export type { MarkLevel };

export type MarkInput = {
  scope: "job" | "library";
  opportunityId: string | null;
  questionKey: string;
  level: MarkLevel;
  markedAt: Date;
  drilled: boolean;
};

export type MarkView = {
  level: MarkLevel;
  markedAt: Date;
  drillCount: number;
  lastDrilledAt: Date | null;
  applied: boolean;
};

export const markInputSchema = z.object({
  scope: z.enum(MARK_SCOPES, { message: "Choose job or library." }),
  opportunityId: z.string().uuid({ message: "That job id is not valid." }).nullable(),
  questionKey: z.string().regex(/^[0-9a-f]{16}$/, { message: "That question key is not valid." }),
  level: z.enum(MARK_LEVELS, { message: "Choose Shaky, Okay or Solid." }),
  markedAt: z
    .string()
    .refine((v) => !Number.isNaN(Date.parse(v)), { message: "That time is not valid." })
    .transform((v) => new Date(v)),
  drilled: z.boolean({ message: "Say whether this came from a drill." }),
});

// A phone with a wrong clock must not win every later conflict forever.
const FUTURE_SKEW_MS = 5 * 60_000;

// The only caller of prepMark.applyMark. Logs nothing: a mark is not worth a
// log line and its key identifies the owner's question.
export async function markQuestion(
  s: Scoped,
  input: MarkInput,
  now: Date = new Date(),
): Promise<Result<MarkView, "not_found" | "invalid">> {
  if (input.scope === "job") {
    if (input.opportunityId === null) return fail("invalid", "A job mark needs a job.");
    const opportunity = await s.opportunity.getById(input.opportunityId);
    if (!opportunity) return fail("not_found", "This job no longer exists.");
    const rows = await s.prepQuestion.listForJob(input.opportunityId);
    if (!rows.some((r) => r.questionKey === input.questionKey)) {
      return fail("not_found", "This question is not in the job any more.");
    }
  } else {
    if (input.opportunityId !== null) return fail("invalid", "A library mark does not belong to a job.");
    const known =
      (await s.prepQuestion.listByQuestionKey(input.questionKey)).length > 0 ||
      (await s.libraryItem.list({ includeArchived: true })).some((i) => i.questionKey === input.questionKey);
    if (!known) return fail("not_found", "This question is not in your prep or library.");
  }

  const latest = new Date(now.getTime() + FUTURE_SKEW_MS);
  const markedAt = input.markedAt.getTime() > latest.getTime() ? now : input.markedAt;

  const { row, applied } = await s.prepMark.applyMark({
    scope: input.scope,
    opportunityId: input.opportunityId,
    questionKey: input.questionKey,
    level: input.level,
    markedAt,
    drilled: input.drilled,
  });
  return ok({
    level: row.level,
    markedAt: row.markedAt,
    drillCount: row.drillCount,
    lastDrilledAt: row.lastDrilledAt,
    // An equal timestamp keeps the stored level, so say it was not applied
    // when that level differs from the one sent.
    applied: applied && row.level === input.level,
  });
}
