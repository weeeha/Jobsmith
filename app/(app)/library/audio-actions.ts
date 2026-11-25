"use server";

import { z } from "zod";

import { audioDeps } from "@/lib/audio/deps";
import { generateMissing, lookupSegments, planSegments, segmentHash } from "@/lib/audio/segments";
import { requireUser } from "@/lib/auth/session";
import { scopedFor } from "@/lib/db/scoped";
import { env } from "@/lib/env";
import { itemPlanSource } from "@/lib/library/drill";
import { audioContext } from "@/lib/prep/audio-status";
import { spokenSteps } from "@/lib/prep/plan";
import { SEGMENT_BATCH_LIMIT } from "@/lib/prep/values";
import { fail, ok, type Result } from "@/lib/result";
import { TTS_STYLE_ID } from "@/lib/tts/driver";

// The Library drill asks for clips two items ahead; this is the most one call does.
const LIBRARY_AUDIO_MAX_ITEMS = 2;

const keysSchema = z.array(z.string().regex(/^[0-9a-f]{16}$/, { message: "That question key is not valid." })).max(50);

type Clips = Record<string, { askAssetId: string | null; sayAssetId: string | null }>;

// Generates the missing clips for library items on demand, through the same
// planner as a job's clips, and returns the asset ids. With voice generation
// off it does nothing and the player uses the browser voice.
export async function ensureLibraryAudioAction(questionKeys: string[]): Promise<Result<{ clips: Clips }, string>> {
  const user = await requireUser();
  const parsed = keysSchema.safeParse(questionKeys);
  if (!parsed.success) return fail("invalid", parsed.error.issues[0]?.message ?? "That question key is not valid.");

  const deps = audioDeps();
  const config = env().TTS;
  if (!config || !deps.tts) return ok({ clips: {} });

  const s = scopedFor(user.id);
  const context = await audioContext(s, deps, config);
  const items = await s.libraryItem.list({ includeArchived: false });
  const picked = [...new Set(parsed.data)]
    .flatMap((key) => {
      const item = items.find((i) => i.questionKey === key);
      return item ? [{ key, item }] : [];
    })
    .slice(0, LIBRARY_AUDIO_MAX_ITEMS);
  if (picked.length === 0) return ok({ clips: {} });

  const sources = picked.map(({ key, item }, i) => itemPlanSource(item, i + 1, key));
  const before = await planSegments(s, { sources, identity: context.identity, voices: context.voices });
  await generateMissing(s, deps, {
    needs: before.missing,
    limit: SEGMENT_BATCH_LIMIT,
    identity: context.identity,
    voices: context.voices,
  });

  const steps = spokenSteps(sources);
  const hashOf = (speaker: "interviewer" | "candidate", text: string) =>
    segmentHash({ ...context.identity, voice: context.voices[speaker], style: TTS_STYLE_ID, spokenText: text });
  const found = await lookupSegments(s, steps.map((st) => hashOf(st.speaker, st.text)));
  const clips: Clips = {};
  picked.forEach(({ key }, index) => {
    const mine = steps.filter((st) => st.questionIndex === index);
    const assetOf = (kind: "question" | "text") => {
      const step = mine.find((st) => st.kind === kind);
      return step ? (found.get(hashOf(step.speaker, step.text))?.assetId ?? null) : null;
    };
    clips[key] = { askAssetId: assetOf("question"), sayAssetId: assetOf("text") };
  });
  return ok({ clips });
}
