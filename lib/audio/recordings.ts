// The one writer of `recording` assets: the user's own spoken answers, kept
// from Drill (spec 5.4). Separate from lib/audio/segments.ts, which writes
// tts_segment assets. A recording is linked to its question through the
// session's meta (`recordings`), because the asset table has no question
// column.
import { createHash } from "node:crypto";
import { z } from "zod";
import type { Scoped } from "@/lib/db/scoped";
import type { Storage } from "@/lib/storage/driver";
import { userPrefix } from "@/lib/storage/keys";
import { fail, ok, type Result } from "@/lib/result";
import { RECORDING_MAX_BYTES } from "@/lib/prep/values";

type Deps = { storage: Storage; randomHex(bytes: number): string };

const EXTENSIONS = { "audio/webm": "webm", "audio/mp4": "mp4", "audio/ogg": "ogg" } as const;
type RecordingType = keyof typeof EXTENSIONS;

const entrySchema = z.object({ questionKey: z.string(), assetId: z.string(), createdAt: z.string() });
export type RecordingEntry = z.infer<typeof entrySchema>;

// "audio/webm;codecs=opus" is audio/webm: the codecs are not part of the type check.
export function recordingType(contentType: string): RecordingType | null {
  const base = contentType.split(";")[0].trim().toLowerCase();
  return base in EXTENSIONS ? (base as RecordingType) : null;
}

function readEntries(meta: unknown): RecordingEntry[] {
  const raw = meta && typeof meta === "object" ? (meta as { recordings?: unknown }).recordings : undefined;
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((item) => {
    const parsed = entrySchema.safeParse(item);
    return parsed.success ? [parsed.data] : [];
  });
}

function withEntries(meta: unknown, recordings: RecordingEntry[]): Record<string, unknown> {
  const base = meta && typeof meta === "object" && !Array.isArray(meta) ? (meta as Record<string, unknown>) : {};
  return { ...base, recordings };
}

export async function storeRecording(
  s: Scoped,
  deps: Deps,
  input: { opportunityId: string; sessionId: string; questionKey: string; contentType: string; bytes: Uint8Array; now?: Date },
): Promise<Result<{ assetId: string }, "not_found" | "invalid" | "too_large">> {
  const type = recordingType(input.contentType);
  if (type === null) return fail("invalid", "Recordings can be audio/webm, audio/mp4 or audio/ogg.");
  if (input.bytes.length === 0) return fail("invalid", "The recording is empty.");
  if (input.bytes.length > RECORDING_MAX_BYTES) return fail("too_large", "The recording is too large.");

  const opportunity = await s.opportunity.getById(input.opportunityId);
  if (!opportunity) return fail("not_found", "This job no longer exists.");
  const session = await s.prepSession.getById(input.sessionId);
  if (!session || session.opportunityId !== opportunity.id) return fail("not_found", "This session no longer exists.");
  const rows = await s.prepQuestion.listForJob(opportunity.id);
  if (!rows.some((r) => r.questionKey === input.questionKey)) return fail("not_found", "This question is not in the job any more.");

  const key = `${userPrefix(s.userId)}rec/${deps.randomHex(16)}.${EXTENSIONS[type]}`;
  await deps.storage.put(key, input.bytes, type);
  const createdAt = (input.now ?? new Date()).toISOString();
  try {
    const assetId = await s.transaction(async (tx) => {
      const asset = await tx.asset.insert({
        kind: "recording",
        storageKey: key,
        contentType: type,
        bytes: input.bytes.length,
        sha256: createHash("sha256").update(input.bytes).digest("hex"),
        durationMs: null,
        opportunityId: opportunity.id,
      });
      const fresh = await tx.prepSession.getById(session.id);
      const entries = readEntries(fresh?.meta);
      await tx.prepSession.update(session.id, {
        meta: withEntries(fresh?.meta, [...entries, { questionKey: input.questionKey, assetId: asset.id, createdAt }]),
      });
      return asset.id;
    });
    return ok({ assetId });
  } catch (error) {
    await deps.storage.delete(key).catch(() => {});
    throw error;
  }
}

export type StoredRecording = { assetId: string; createdAt: Date };

// Every kept recording of a job by question key, newest first. An entry whose
// asset is gone (deleted by hand, or the object was removed) is left out.
export async function recordingsForJob(s: Scoped, opportunityId: string): Promise<Map<string, StoredRecording[]>> {
  const out = new Map<string, StoredRecording[]>();
  for (const session of await s.prepSession.listForJob(opportunityId)) {
    for (const entry of readEntries(session.meta)) {
      const asset = await s.asset.getById(entry.assetId);
      if (!asset || asset.kind !== "recording") continue;
      const list = out.get(entry.questionKey) ?? [];
      list.push({ assetId: entry.assetId, createdAt: new Date(entry.createdAt) });
      out.set(entry.questionKey, list);
    }
  }
  for (const list of out.values()) list.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  return out;
}

export async function listRecordings(s: Scoped, opportunityId: string, questionKey: string): Promise<StoredRecording[]> {
  return (await recordingsForJob(s, opportunityId)).get(questionKey) ?? [];
}

export async function deleteRecording(s: Scoped, deps: Pick<Deps, "storage">, assetId: string): Promise<Result<null, "not_found">> {
  const asset = await s.asset.getById(assetId);
  if (!asset || asset.kind !== "recording") return fail("not_found", "This recording no longer exists.");
  // Meta entries first: a stale entry is harmless (listRecordings skips it), a stale asset is not.
  if (asset.opportunityId !== null) {
    for (const session of await s.prepSession.listForJob(asset.opportunityId)) {
      const entries = readEntries(session.meta);
      if (!entries.some((e) => e.assetId === assetId)) continue;
      await s.prepSession.update(session.id, {
        meta: withEntries(session.meta, entries.filter((e) => e.assetId !== assetId)),
      });
    }
  }
  const deleted = await s.asset.delete(assetId);
  if (deleted) await deps.storage.delete(deleted.storageKey).catch(() => {});
  return ok(null);
}
