"use server";

import { z } from "zod";

import { deleteRecording } from "@/lib/audio/recordings";
import { getStorage } from "@/lib/storage";
import { requireUser } from "@/lib/auth/session";
import { scopedFor } from "@/lib/db/scoped";
import { markInputSchema, markQuestion } from "@/lib/prep/marks";
import { rebuildForJob } from "@/lib/prep/rebuild";
import { endSession, startSession } from "@/lib/prep/sessions";
import { PREP_MODES, type MarkLevel, type PrepMode } from "@/lib/prep/values";
import { opportunityIdSchema } from "@/lib/pipeline/action-schemas";
import { messageFor } from "@/lib/pipeline/messages";
import { fail, ok, type Result } from "@/lib/result";

// The client calls router.refresh() after a write, so none of these revalidate.

function firstMessage(error: z.ZodError): string {
  return error.issues[0]?.message ?? messageFor("invalid");
}

export async function markQuestionAction(input: {
  opportunityId: string | null;
  scope: "job" | "library";
  questionKey: string;
  level: MarkLevel;
  markedAt: string;
  drilled: boolean;
}): Promise<Result<{ level: MarkLevel; markedAt: string; drillCount: number; applied: boolean }, string>> {
  const user = await requireUser();
  const parsed = markInputSchema.safeParse(input);
  if (!parsed.success) return fail("invalid", firstMessage(parsed.error));
  const result = await markQuestion(scopedFor(user.id), parsed.data);
  if (!result.ok) return result;
  const { level, markedAt, drillCount, applied } = result.data;
  return ok({ level, markedAt: markedAt.toISOString(), drillCount, applied });
}

export async function rebuildQuestionsAction(opportunityId: string): Promise<Result<{ rows: number }, string>> {
  const user = await requireUser();
  const parsed = opportunityIdSchema.safeParse(opportunityId);
  if (!parsed.success) return fail("not_found", messageFor("not_found"));
  const result = await rebuildForJob(scopedFor(user.id), parsed.data);
  if (!result.ok) return result;
  return ok({ rows: result.data.rows });
}

const startSessionSchema = z.object({
  opportunityId: opportunityIdSchema.nullable(),
  mode: z.enum(PREP_MODES, { message: "Choose Listen, Drill or Quick-fire." }),
  questions: z.number().int({ message: "Give a whole number of questions." }).min(0, { message: "Give a whole number of questions." }).max(1000, { message: "That is too many questions." }),
  meta: z.record(z.string(), z.unknown()).optional(),
});

export async function startSessionAction(input: {
  opportunityId: string | null;
  mode: PrepMode;
  questions: number;
  meta?: Record<string, unknown>;
}): Promise<Result<{ id: string }, string>> {
  const user = await requireUser();
  const parsed = startSessionSchema.safeParse(input);
  if (!parsed.success) {
    // A malformed job id reads as a missing job, as in every job action.
    const idIssue = parsed.error.issues.some((i) => i.path[0] === "opportunityId");
    return idIssue ? fail("not_found", messageFor("not_found")) : fail("invalid", firstMessage(parsed.error));
  }
  const result = await startSession(scopedFor(user.id), parsed.data);
  return result.ok ? ok({ id: result.data.id }) : result;
}

const endSessionSchema = z.object({
  id: z.uuid(),
  seen: z.number().int().min(0),
  marked: z.number().int().min(0),
  solid: z.number().int().min(0),
});

export async function endSessionAction(input: {
  id: string;
  seen: number;
  marked: number;
  solid: number;
}): Promise<Result<{ eventWritten: boolean }, string>> {
  const user = await requireUser();
  const parsed = endSessionSchema.safeParse(input);
  if (!parsed.success) {
    return parsed.error.issues.some((i) => i.path[0] === "id")
      ? fail("not_found", "This session no longer exists.")
      : fail("invalid", firstMessage(parsed.error));
  }
  const result = await endSession(scopedFor(user.id), parsed.data);
  return result.ok ? ok({ eventWritten: result.data.eventWritten }) : result;
}

export async function deleteRecordingAction(assetId: string): Promise<Result<null, string>> {
  const user = await requireUser();
  const parsed = z.uuid().safeParse(assetId);
  if (!parsed.success) return fail("not_found", "This recording no longer exists.");
  const result = await deleteRecording(scopedFor(user.id), { storage: getStorage() }, parsed.data);
  return result.ok ? ok(null) : result;
}
