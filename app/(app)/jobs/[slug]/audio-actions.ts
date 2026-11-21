"use server";

import { audioDeps } from "@/lib/audio/deps";
import { deleteUnreferenced, generateMissing, planSegments, referencedHashes, regenerateSegment } from "@/lib/audio/segments";
import { requireUser } from "@/lib/auth/session";
import { scopedFor } from "@/lib/db/scoped";
import { env } from "@/lib/env";
import { opportunityIdSchema } from "@/lib/pipeline/action-schemas";
import { messageFor } from "@/lib/pipeline/messages";
import { audioContext, sourcesForJob } from "@/lib/prep/audio-status";
import { SEGMENT_BATCH_LIMIT } from "@/lib/prep/values";
import { fail, ok, type Result } from "@/lib/result";

// The job page sets maxDuration = 60, which covers these calls; generateMissing
// also stops starting clips after BATCH_BUDGET_MS. The client calls
// router.refresh() after a write, so none of these revalidate.

const HASH = /^[0-9a-f]{16}$/;

const TTS_OFF_MESSAGE = "Voice generation is off. Set it up in the server settings, or run jobsmith audio from your computer.";

export async function prepareAudioAction(
  opportunityId: string,
  docKey: string | null,
): Promise<Result<{ done: number; total: number; paused: boolean }, string>> {
  const user = await requireUser();
  const parsed = opportunityIdSchema.safeParse(opportunityId);
  if (!parsed.success) return fail("not_found", messageFor("not_found"));
  const s = scopedFor(user.id);
  if (!(await s.opportunity.getById(parsed.data))) return fail("not_found", messageFor("not_found"));

  const deps = audioDeps();
  const config = env().TTS;
  if (!config || !deps.tts) return fail("tts_off", TTS_OFF_MESSAGE);

  const context = await audioContext(s, deps, config);
  const sources = await sourcesForJob(s, parsed.data, docKey);
  const before = await planSegments(s, { sources, identity: context.identity, voices: context.voices });
  const batch = await generateMissing(s, deps, {
    needs: before.missing,
    limit: SEGMENT_BATCH_LIMIT,
    identity: context.identity,
    voices: context.voices,
  });
  const after = await planSegments(s, { sources, identity: context.identity, voices: context.voices });
  return ok({ done: after.done, total: after.total, paused: batch.paused });
}

export async function regenerateClipAction(opportunityId: string, hash: string): Promise<Result<{ suspect: boolean }, string>> {
  const user = await requireUser();
  const parsed = opportunityIdSchema.safeParse(opportunityId);
  if (!parsed.success || !HASH.test(hash)) return fail("not_found", messageFor("not_found"));
  const s = scopedFor(user.id);
  if (!(await s.opportunity.getById(parsed.data))) return fail("not_found", messageFor("not_found"));

  const deps = audioDeps();
  const context = await audioContext(s, deps, env().TTS);
  const result = await regenerateSegment(s, deps, hash, context.identity, context.voices);
  if (!result.ok) return result.code === "not_found" ? fail("not_found", messageFor("not_found")) : fail("tts_error", result.message);
  return ok(result.data);
}

// Clips that no current question, library item or pitch needs, in every job.
export async function deleteAudioAction(): Promise<Result<{ deleted: number }, string>> {
  const user = await requireUser();
  const s = scopedFor(user.id);
  const deps = audioDeps();
  const context = await audioContext(s, deps, env().TTS);
  const referenced = await referencedHashes(s, context.identity, context.voices);
  return ok({ deleted: await deleteUnreferenced(s, deps, referenced) });
}
