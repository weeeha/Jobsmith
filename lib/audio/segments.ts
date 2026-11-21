// The only writer of tts_segment rows and of the assets they point at
// (recordings, Task 36, are the one other asset writer). A segment is the
// audio for one spoken step, addressed by a hash of what makes it sound the
// way it does, so reordering costs nothing and a changed word costs one clip.
import { createHash } from "node:crypto";
import type { Scoped } from "@/lib/db/scoped";
import type { TtsSegmentRow } from "@/lib/db/scoped/tts-segment";
import { fail, ok, type Result } from "@/lib/result";
import { questionKey } from "@/lib/prep/question-key";
import { pitchChapters, spokenSteps, type PlanSource, type Speaker } from "@/lib/prep/plan";
import { BATCH_BUDGET_MS, SEGMENT_MAX_BYTES } from "@/lib/prep/values";
import type { TtsIdentity } from "@/lib/tts/config";
import { TTS_STYLE_ID, type TtsErrorCode } from "@/lib/tts/driver";
import { passesGate } from "@/lib/tts/gate";
import { userPrefix } from "@/lib/storage/keys";
import { prepareClip, type PreparedClip } from "./normalize";
import type { AudioDeps } from "./deps";

export type { Speaker } from "@/lib/prep/plan";
export type { AudioDeps } from "./deps";

type Voices = { interviewer: string; candidate: string };
export type SegmentNeed = { hash: string; speaker: Speaker; text: string };
export type SegmentPlan = { total: number; done: number; failed: number; suspect: number; missing: SegmentNeed[] };

export function segmentHash(input: { provider: string; model: string; voice: string; style: string; spokenText: string }): string {
  const material = `${input.provider} | ${input.model} | ${input.voice} | ${input.style} | ${input.spokenText}`;
  return createHash("sha256").update(material).digest("hex").slice(0, 16);
}

// ---------- planning ----------

function distinctNeeds(sources: PlanSource[], identity: TtsIdentity, voices: Voices): Map<string, SegmentNeed> {
  const needs = new Map<string, SegmentNeed>();
  for (const step of spokenSteps(sources)) {
    const hash = segmentHash({ ...identity, voice: voices[step.speaker], style: TTS_STYLE_ID, spokenText: step.text });
    if (!needs.has(hash)) needs.set(hash, { hash, speaker: step.speaker, text: step.text });
  }
  return needs;
}

export async function planSegments(
  s: Scoped,
  input: { sources: PlanSource[]; identity: TtsIdentity; voices: Voices; includeFailed?: boolean },
): Promise<SegmentPlan> {
  const needs = distinctNeeds(input.sources, input.identity, input.voices);
  const rows = new Map((await s.ttsSegment.listByHashes([...needs.keys()])).map((r) => [r.hash, r]));
  const plan: SegmentPlan = { total: needs.size, done: 0, failed: 0, suspect: 0, missing: [] };
  for (const need of needs.values()) {
    const row = rows.get(need.hash);
    if (row?.status === "done") {
      plan.done += 1;
      if (row.suspect) plan.suspect += 1;
    } else if (row?.status === "failed") {
      plan.failed += 1;
      if (input.includeFailed) plan.missing.push(need);
    } else {
      plan.missing.push(need);
    }
  }
  return plan;
}

// Everything any current question, library item or pitch would speak. A
// library item reads as its title (interviewer) and its body (candidate).
async function currentSources(s: Scoped): Promise<PlanSource[]> {
  const sources: PlanSource[] = [];
  for (const q of await s.prepQuestion.listAll()) {
    sources.push({ question: q.question, section: q.section, number: q.number, questionKey: q.questionKey, blocks: q.blocks });
  }
  const items = await s.libraryItem.list({ includeArchived: true });
  items.forEach((item, i) => {
    sources.push({
      question: item.title,
      section: null,
      number: i + 1,
      questionKey: item.questionKey ?? questionKey(item.title),
      blocks: [{ label: "Say", spoken: true, text: item.bodyMd }],
    });
  });
  const latest = new Map<string, { version: number; bodyMd: string }>();
  for (const a of await s.artifact.listAll()) {
    if (a.kind !== "pitch") continue;
    const scopeKey = `${a.opportunityId ?? a.companyId}:${a.key}`;
    const seen = latest.get(scopeKey);
    if (!seen || a.version > seen.version) latest.set(scopeKey, { version: a.version, bodyMd: a.bodyMd });
  }
  for (const pitch of latest.values()) sources.push(...pitchChapters(pitch.bodyMd));
  return sources;
}

export async function referencedHashes(s: Scoped, identity: TtsIdentity, voices: Voices): Promise<Set<string>> {
  return new Set(distinctNeeds(await currentSources(s), identity, voices).keys());
}

// ---------- writing ----------

class HashConflict extends Error {}

function log(line: { hash: string; code: string | null; provider: string; model: string; voice: string; ms: number; bytes: number }) {
  // Never the text, and never the user: the hash is the only identifier.
  console.info("[tts]", line);
}

type Synthesized =
  | { ok: true; clip: PreparedClip; suspect: boolean; attempts: number; rateLimited: boolean }
  | { ok: false; code: TtsErrorCode };

async function synthesizeClip(deps: AudioDeps, need: SegmentNeed, voice: string): Promise<Synthesized> {
  const driver = deps.tts;
  if (!driver) return { ok: false, code: "tts_error" };
  const attempt = async (style: "default" | "strict"): Promise<Result<PreparedClip, TtsErrorCode>> => {
    let audio;
    try {
      audio = await driver.synthesize({ text: need.text, voice, style, format: "mp3" });
    } catch {
      return fail("tts_error", "driver threw");
    }
    if (!audio.ok) return audio;
    return prepareClip(audio.data);
  };

  const first = await attempt("default");
  if (!first.ok) return { ok: false, code: first.code };
  if (passesGate(need.text.length, first.data.durationMs)) {
    return { ok: true, clip: first.data, suspect: false, attempts: 1, rateLimited: false };
  }
  const second = await attempt("strict");
  if (!second.ok) {
    // Keep what we have, flagged for a second look.
    return { ok: true, clip: first.data, suspect: true, attempts: 2, rateLimited: second.code === "tts_rate_limited" };
  }
  return {
    ok: true,
    clip: second.data,
    suspect: !passesGate(need.text.length, second.data.durationMs),
    attempts: 2,
    rateLimited: false,
  };
}

async function removeObject(deps: AudioDeps, key: string): Promise<void> {
  try {
    await deps.storage.delete(key);
  } catch {
    // An object left behind is harmless; the row is already gone.
  }
}

type Stored = { ok: true } | { ok: false; reason: "conflict" | "storage_error" };

async function storeClip(
  s: Scoped,
  deps: AudioDeps,
  input: {
    need: SegmentNeed | null;
    hash: string;
    voice: string;
    identity: TtsIdentity;
    clip: { bytes: Uint8Array; contentType: string; ext: "mp3" | "wav" | "ogg"; durationMs: number | null };
    suspect: boolean;
    attempts: number;
    existing: TtsSegmentRow | null;
  },
): Promise<Stored> {
  const key = `${userPrefix(s.userId)}tts/${deps.randomHex(16)}.${input.clip.ext}`;
  try {
    await deps.storage.put(key, input.clip.bytes, input.clip.contentType);
  } catch {
    return { ok: false, reason: "storage_error" };
  }
  const fields = {
    status: "done" as const,
    errorCode: null,
    suspect: input.suspect,
    attempts: input.attempts,
    voice: input.voice,
    textChars: input.need?.text.length ?? 0,
  };
  try {
    await s.transaction(async (tx) => {
      const asset = await tx.asset.insert({
        kind: "tts_segment",
        storageKey: key,
        contentType: input.clip.contentType,
        bytes: input.clip.bytes.length,
        sha256: createHash("sha256").update(input.clip.bytes).digest("hex"),
        durationMs: input.clip.durationMs,
      });
      if (input.existing) {
        const updated = await tx.ttsSegment.update(input.existing.id, { ...fields, assetId: asset.id });
        if (!updated) throw new HashConflict();
      } else {
        const inserted = await tx.ttsSegment.insert({
          ...fields,
          hash: input.hash,
          provider: input.identity.provider,
          model: input.identity.model,
          style: TTS_STYLE_ID,
          assetId: asset.id,
        });
        if (!inserted) throw new HashConflict();
      }
    });
  } catch (error) {
    await removeObject(deps, key);
    if (error instanceof HashConflict) return { ok: false, reason: "conflict" };
    throw error;
  }
  // The segment now points at the new asset, so the old one can go.
  if (input.existing?.assetId) {
    const old = await s.asset.delete(input.existing.assetId);
    if (old) await removeObject(deps, old.storageKey);
  }
  return { ok: true };
}

async function writeFailed(
  s: Scoped,
  input: { need: SegmentNeed; voice: string; identity: TtsIdentity; code: string; attempts: number; existing: TtsSegmentRow | null },
): Promise<void> {
  if (input.existing) {
    await s.ttsSegment.update(input.existing.id, { status: "failed", errorCode: input.code, attempts: input.attempts });
    return;
  }
  // Null means another writer got there first, which is fine.
  await s.ttsSegment.insert({
    hash: input.need.hash,
    provider: input.identity.provider,
    model: input.identity.model,
    voice: input.voice,
    style: TTS_STYLE_ID,
    textChars: input.need.text.length,
    assetId: null,
    status: "failed",
    errorCode: input.code,
    attempts: input.attempts,
  });
}

export async function generateMissing(
  s: Scoped,
  deps: AudioDeps,
  input: { needs: SegmentNeed[]; limit: number; identity: TtsIdentity; voices: Voices },
): Promise<{ generated: number; failed: number; paused: boolean }> {
  const result = { generated: 0, failed: 0, paused: false };
  if (!deps.tts) return result;
  const startedAt = deps.now().getTime();
  const existing = new Map((await s.ttsSegment.listByHashes(input.needs.map((n) => n.hash))).map((r) => [r.hash, r]));
  let started = 0;

  for (const need of input.needs) {
    if (started >= input.limit) break;
    if (deps.now().getTime() - startedAt >= BATCH_BUDGET_MS) break;
    const row = existing.get(need.hash) ?? null;
    if (row?.status === "done") continue;
    started += 1;

    const voice = input.voices[need.speaker];
    const clockStart = deps.now().getTime();
    const line = { hash: need.hash, provider: input.identity.provider, model: input.identity.model, voice };
    const elapsed = () => deps.now().getTime() - clockStart;

    const synthesized = await synthesizeClip(deps, need, voice);
    if (!synthesized.ok) {
      log({ ...line, code: synthesized.code, ms: elapsed(), bytes: 0 });
      if (synthesized.code === "tts_rate_limited") {
        result.paused = true;
        break;
      }
      await writeFailed(s, { need, voice, identity: input.identity, code: synthesized.code, attempts: 1, existing: row });
      result.failed += 1;
      continue;
    }

    const stored = await storeClip(s, deps, {
      need,
      hash: need.hash,
      voice,
      identity: input.identity,
      clip: synthesized.clip,
      suspect: synthesized.suspect,
      attempts: synthesized.attempts,
      existing: row,
    });
    if (stored.ok) {
      log({ ...line, code: null, ms: elapsed(), bytes: synthesized.clip.bytes.length });
      result.generated += 1;
    } else if (stored.reason === "storage_error") {
      log({ ...line, code: "storage_error", ms: elapsed(), bytes: synthesized.clip.bytes.length });
      await writeFailed(s, { need, voice, identity: input.identity, code: "storage_error", attempts: synthesized.attempts, existing: row });
      result.failed += 1;
    } else {
      // Another writer won the hash; its clip stands and ours is already gone.
      log({ ...line, code: "conflict", ms: elapsed(), bytes: synthesized.clip.bytes.length });
    }
    if (synthesized.rateLimited) {
      result.paused = true;
      break;
    }
  }
  return result;
}

const UPLOAD_TYPES: Record<string, "mp3" | "wav" | "ogg"> = { "audio/mpeg": "mp3", "audio/wav": "wav", "audio/ogg": "ogg" };

export async function storeUploaded(
  s: Scoped,
  deps: AudioDeps,
  input: {
    identity: TtsIdentity;
    voices: Voices;
    plannedHashes: Set<string>;
    uploads: { hash: string; contentType: string; durationMs: number | null; bytes: Uint8Array }[];
  },
): Promise<{
  stored: number;
  skipped: number;
  rejected: { hash: string; reason: "not_planned" | "too_large" | "bad_content_type" }[];
}> {
  const out = { stored: 0, skipped: 0, rejected: [] as { hash: string; reason: "not_planned" | "too_large" | "bad_content_type" }[] };
  const accepted: { upload: (typeof input.uploads)[number]; ext: "mp3" | "wav" | "ogg" }[] = [];
  for (const upload of input.uploads) {
    const ext = UPLOAD_TYPES[upload.contentType.split(";")[0].trim().toLowerCase()];
    if (!input.plannedHashes.has(upload.hash)) out.rejected.push({ hash: upload.hash, reason: "not_planned" });
    else if (upload.bytes.length > SEGMENT_MAX_BYTES) out.rejected.push({ hash: upload.hash, reason: "too_large" });
    else if (!ext) out.rejected.push({ hash: upload.hash, reason: "bad_content_type" });
    else accepted.push({ upload, ext });
  }
  if (accepted.length === 0) return out;

  // What the segment was for (speaker, text) comes from the current questions,
  // since an upload carries only the hash.
  const needs = distinctNeeds(await currentSources(s), input.identity, input.voices);
  const rows = new Map((await s.ttsSegment.listByHashes(accepted.map((a) => a.upload.hash))).map((r) => [r.hash, r]));
  for (const { upload, ext } of accepted) {
    const row = rows.get(upload.hash) ?? null;
    if (row?.status === "done") {
      out.skipped += 1;
      continue;
    }
    const need = needs.get(upload.hash) ?? null;
    const stored = await storeClip(s, deps, {
      need,
      hash: upload.hash,
      voice: need ? input.voices[need.speaker] : "",
      identity: input.identity,
      clip: { bytes: upload.bytes, contentType: `audio/${ext === "mp3" ? "mpeg" : ext}`, ext, durationMs: upload.durationMs },
      suspect: need ? !passesGate(need.text.length, upload.durationMs) : false,
      attempts: 1,
      existing: row,
    });
    if (stored.ok) out.stored += 1;
    else if (stored.reason === "conflict") out.skipped += 1;
    else throw new Error("storage_error");
  }
  return out;
}

export async function regenerateSegment(
  s: Scoped,
  deps: AudioDeps,
  hash: string,
  identity: TtsIdentity,
  voices: Voices,
): Promise<Result<{ suspect: boolean }, "not_found" | "tts_error">> {
  const need = distinctNeeds(await currentSources(s), identity, voices).get(hash);
  if (!need) return fail("not_found", "No current question needs this clip.");
  if (!deps.tts) return fail("tts_error", "No voice provider is configured.");
  const voice = voices[need.speaker];
  const synthesized = await synthesizeClip(deps, need, voice);
  if (!synthesized.ok) return fail("tts_error", synthesized.code);
  const existing = (await s.ttsSegment.listByHashes([hash]))[0] ?? null;
  const stored = await storeClip(s, deps, {
    need,
    hash,
    voice,
    identity,
    clip: synthesized.clip,
    suspect: synthesized.suspect,
    attempts: synthesized.attempts,
    existing,
  });
  if (stored.ok) return ok({ suspect: synthesized.suspect });
  if (stored.reason === "conflict") {
    const winner = (await s.ttsSegment.listByHashes([hash]))[0];
    return ok({ suspect: winner?.suspect ?? false });
  }
  return fail("tts_error", "storage_error");
}

// ---------- cleanup ----------

export async function deleteUnreferenced(s: Scoped, deps: AudioDeps, referenced: Set<string>): Promise<number> {
  let removed = 0;
  for (const row of await s.ttsSegment.listAll()) {
    if (referenced.has(row.hash)) continue;
    if (row.assetId) {
      // The segment goes with its asset (cascade).
      const asset = await s.asset.delete(row.assetId);
      if (asset) await removeObject(deps, asset.storageKey);
    } else {
      await s.ttsSegment.deleteByIds([row.id]);
    }
    removed += 1;
  }
  return removed;
}

export async function deleteAllAudio(s: Scoped, deps: AudioDeps): Promise<number> {
  const segments = await s.ttsSegment.listAll();
  for (const asset of await s.asset.listAll()) {
    if (asset.kind !== "tts_segment") continue;
    const deleted = await s.asset.delete(asset.id);
    if (deleted) await removeObject(deps, deleted.storageKey);
  }
  await s.ttsSegment.deleteByIds(segments.map((r) => r.id));
  return segments.length;
}

export async function markObjectMissing(s: Scoped, assetId: string): Promise<void> {
  const row = await s.ttsSegment.getByAssetId(assetId);
  if (!row) return;
  await s.ttsSegment.update(row.id, { status: "failed", errorCode: "object_missing" });
}

export async function lookupSegments(
  s: Scoped,
  hashes: string[],
): Promise<Map<string, { assetId: string; suspect: boolean }>> {
  const out = new Map<string, { assetId: string; suspect: boolean }>();
  for (const row of await s.ttsSegment.listByHashes(hashes)) {
    if (row.status === "done" && row.assetId) out.set(row.hash, { assetId: row.assetId, suspect: row.suspect });
  }
  return out;
}
