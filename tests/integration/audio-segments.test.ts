import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { makeTestDb, createTestUser } from "../helpers/db";
import { scoped, type Scoped } from "@/lib/db/scoped";
import { createOpportunity } from "@/lib/pipeline/create";
import {
  deleteAllAudio,
  deleteUnreferenced,
  generateMissing,
  lookupSegments,
  markObjectMissing,
  planSegments,
  referencedHashes,
  regenerateSegment,
  segmentHash,
  storeUploaded,
} from "@/lib/audio/segments";
import type { AudioDeps } from "@/lib/audio/deps";
import type { PlanSource } from "@/lib/prep/plan";
import { BATCH_BUDGET_MS, SEGMENT_MAX_BYTES } from "@/lib/prep/values";
import { createFakeTtsDriver, silentMp3 } from "@/lib/tts/fake";
import { TTS_STYLE_ID, type TtsDriver, type TtsRequest } from "@/lib/tts/driver";
import { createMemoryStorage } from "@/lib/storage/memory";
import type { Storage } from "@/lib/storage/driver";
import { STORAGE_KEY_PATTERN, userPrefix } from "@/lib/storage/keys";
import { ok } from "@/lib/result";
import { expectFail, expectOk } from "../helpers/result";

const identity = { provider: "fake", model: "fake-tts" };
const voices = { interviewer: "Vivian", candidate: "Ryan" };
const NOW = new Date("2026-11-21T12:00:00Z");

function source(question: string, say: string, number = 1): PlanSource {
  return {
    question,
    section: null,
    number,
    questionKey: `key-${number}`,
    blocks: [{ label: "Say", spoken: true, text: say }],
  };
}

// One counter for the whole file, so two deps sharing a database never mint
// the same object key.
let keyCounter = 0;

function makeDeps(over: Partial<AudioDeps> = {}, objects = new Map<string, Uint8Array>()): AudioDeps & { objects: Map<string, Uint8Array> } {
  return {
    tts: createFakeTtsDriver({ sleep: async () => {} }),
    storage: createMemoryStorage(objects),
    now: () => NOW,
    randomHex: (bytes) => (++keyCounter).toString(16).padStart(bytes * 2, "0"),
    ...over,
    objects,
  };
}

async function setup(email = "segments-owner@example.com") {
  const { db, close } = await makeTestDb();
  const user = await createTestUser(db, email);
  return { db, close, s: scoped(db, user.id), userId: user.id };
}

async function needsFor(s: Scoped, sources: PlanSource[], includeFailed = false) {
  return planSegments(s, { sources, identity, voices, includeFailed });
}

function hashOf(speaker: "interviewer" | "candidate", spokenText: string, ident = identity, v = voices) {
  return segmentHash({ ...ident, voice: v[speaker], style: TTS_STYLE_ID, spokenText });
}

function driverReturning(durations: { default: number; strict: number }, calls: TtsRequest[] = []): TtsDriver {
  return {
    name: "fake",
    async synthesize(request) {
      calls.push(request);
      return ok({ audio: silentMp3(durations[request.style]), contentType: "audio/mpeg" });
    },
    async voices() {
      return [];
    },
  };
}

const LONG_TEXT = "x".repeat(130);

afterEach(() => vi.restoreAllMocks());

describe("planSegments", () => {
  it("counts distinct (speaker, text) pairs once and reports total, done, failed and suspect", async () => {
    const { s, close } = await setup();
    try {
      const sources = [source("Q one", "Same answer."), source("Q two", "Same answer.", 2)];
      const plan = await needsFor(s, sources);
      // Q one, Q two, and "Same answer." read by the candidate once.
      expect(plan.total).toBe(3);
      expect(plan).toMatchObject({ done: 0, failed: 0, suspect: 0 });
      expect(plan.missing.map((m) => m.text).sort()).toEqual(["Q one", "Q two", "Same answer."]);
      const answer = plan.missing.find((m) => m.text === "Same answer.")!;
      expect(answer).toEqual({ hash: hashOf("candidate", "Same answer."), speaker: "candidate", text: "Same answer." });
    } finally {
      await close();
    }
  });

  it("skips done hashes, and leaves failed ones out of missing unless includeFailed", async () => {
    const { s, close } = await setup();
    try {
      const sources = [source("Q one", "Answer one.")];
      const deps = makeDeps();
      const first = await needsFor(s, sources);
      await generateMissing(s, deps, { needs: first.missing.slice(0, 1), limit: 20, identity, voices });
      const failedNeed = first.missing[1];
      await s.ttsSegment.insert({ hash: failedNeed.hash, provider: identity.provider, model: identity.model, voice: "x", style: TTS_STYLE_ID, textChars: 3, status: "failed", errorCode: "tts_error", attempts: 1 });
      const plan = await needsFor(s, sources);
      expect(plan).toMatchObject({ total: 2, done: 1, failed: 1, missing: [] });
      const retry = await needsFor(s, sources, true);
      expect(retry.missing.map((m) => m.hash)).toEqual([failedNeed.hash]);
    } finally {
      await close();
    }
  });

  it("the same intro at two jobs is one segment", async () => {
    const { s, close } = await setup();
    try {
      const a = source("Intro question", "I am a designer.", 1);
      const b = { ...source("Intro question", "I am a designer.", 1), questionKey: "other-job-key" };
      const plan = await needsFor(s, [a, b]);
      expect(plan.total).toBe(2);
    } finally {
      await close();
    }
  });

  it("changing a voice starts a new plan and deletes nothing", async () => {
    const { s, close } = await setup();
    try {
      const sources = [source("Q one", "Answer one.")];
      const deps = makeDeps();
      const plan = await needsFor(s, sources);
      await generateMissing(s, deps, { needs: plan.missing, limit: 20, identity, voices });
      const before = (await s.ttsSegment.listAll()).length;
      const other = { interviewer: "Aria", candidate: "Ryan" };
      const next = await planSegments(s, { sources, identity, voices: other });
      expect(next.missing.map((m) => m.text)).toEqual(["Q one"]);
      expect(next.done).toBe(1);
      expect((await s.ttsSegment.listAll()).length).toBe(before);
      expect(deps.objects.size).toBe(before);
    } finally {
      await close();
    }
  });
});

describe("generateMissing", () => {
  it("stores each clip under u/<hash>/tts/<random>.mp3 with an asset row and a done segment row", async () => {
    const { s, userId, close } = await setup();
    try {
      const plan = await needsFor(s, [source("Q one", "Answer one.")]);
      const deps = makeDeps();
      const result = await generateMissing(s, deps, { needs: plan.missing, limit: 20, identity, voices });
      expect(result).toEqual({ generated: 2, failed: 0, paused: false });
      const rows = await s.ttsSegment.listAll();
      expect(rows).toHaveLength(2);
      for (const row of rows) {
        expect(row).toMatchObject({ status: "done", provider: "fake", model: "fake-tts", style: TTS_STYLE_ID, suspect: false, attempts: 1, errorCode: null });
        const asset = (await s.asset.getById(row.assetId!))!;
        expect(asset.kind).toBe("tts_segment");
        expect(asset.storageKey.startsWith(`${userPrefix(userId)}tts/`)).toBe(true);
        expect(asset.storageKey).toMatch(STORAGE_KEY_PATTERN);
        expect(asset.storageKey.endsWith(".mp3")).toBe(true);
        expect(asset.contentType).toBe("audio/mpeg");
        const bytes = deps.objects.get(asset.storageKey)!;
        expect(asset.bytes).toBe(bytes.length);
        expect(asset.sha256).toMatch(/^[0-9a-f]{64}$/);
        expect(asset.durationMs).toBeGreaterThan(500);
        expect(row.textChars).toBeGreaterThan(0);
      }
      const voicesUsed = rows.map((r) => r.voice).sort();
      expect(voicesUsed).toEqual(["Ryan", "Vivian"]);
    } finally {
      await close();
    }
  });

  it("never exceeds the limit and returns the generated count", async () => {
    const { s, close } = await setup();
    try {
      const plan = await needsFor(s, [source("Q1", "A1.", 1), source("Q2", "A2.", 2), source("Q3", "A3.", 3)]);
      expect(plan.missing).toHaveLength(6);
      const result = await generateMissing(s, makeDeps(), { needs: plan.missing, limit: 4, identity, voices });
      expect(result.generated).toBe(4);
      expect((await s.ttsSegment.listAll())).toHaveLength(4);
    } finally {
      await close();
    }
  });

  it("a clip that fails the gate is retried once with the strict style; a pass on retry leaves suspect false and attempts 2", async () => {
    const { s, close } = await setup();
    try {
      const calls: TtsRequest[] = [];
      const deps = makeDeps({ tts: driverReturning({ default: 100, strict: 9_000 }, calls) });
      const plan = await needsFor(s, [{ ...source("Q", "A."), blocks: [] }]);
      const result = await generateMissing(s, deps, { needs: plan.missing, limit: 20, identity, voices });
      expect(result.generated).toBe(1);
      expect(calls.map((c) => c.style)).toEqual(["default", "strict"]);
      const [row] = await s.ttsSegment.listAll();
      expect(row).toMatchObject({ suspect: false, attempts: 2, status: "done" });
    } finally {
      await close();
    }
  });

  it("a second gate failure keeps the clip and sets suspect true", async () => {
    const { s, close } = await setup();
    try {
      const calls: TtsRequest[] = [];
      const deps = makeDeps({ tts: driverReturning({ default: 100, strict: 150 }, calls) });
      const plan = await needsFor(s, [{ ...source("Q", "A."), blocks: [] }]);
      await generateMissing(s, deps, { needs: plan.missing, limit: 20, identity, voices });
      expect(calls).toHaveLength(2);
      const [row] = await s.ttsSegment.listAll();
      expect(row).toMatchObject({ suspect: true, attempts: 2, status: "done" });
      expect(row.assetId).not.toBeNull();
      expect(deps.objects.size).toBe(1);
    } finally {
      await close();
    }
  });

  it("long text is gated by characters per second", async () => {
    const { s, close } = await setup();
    try {
      const calls: TtsRequest[] = [];
      // 130 characters in 2 s is 65 cps: far too fast.
      const deps = makeDeps({ tts: driverReturning({ default: 2_000, strict: 2_000 }, calls) });
      const plan = await needsFor(s, [{ ...source(LONG_TEXT, "A."), blocks: [] }]);
      await generateMissing(s, deps, { needs: plan.missing, limit: 20, identity, voices });
      const [row] = await s.ttsSegment.listAll();
      expect(row.suspect).toBe(true);
      expect(row.textChars).toBe(130);
    } finally {
      await close();
    }
  });

  it("tts_rate_limited ends the batch early with paused true and writes no failed row for it", async () => {
    const { s, close } = await setup();
    try {
      // Needs are built by hand: the control line must reach the driver as
      // written, and toSpokenText would strip the underscores of the code.
      const need = (text: string, i: number) => ({ hash: `000000000000000${i}`, speaker: "interviewer" as const, text });
      const needs = [need("Fine question", 1), need("Fake error: tts_rate_limited", 2), need("Never reached", 3)];
      const result = await generateMissing(s, makeDeps(), { needs, limit: 20, identity, voices });
      expect(result).toEqual({ generated: 1, failed: 0, paused: true });
      const rows = await s.ttsSegment.listAll();
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({ hash: "0000000000000001", status: "done" });
    } finally {
      await close();
    }
  });

  it("another tts error writes a failed segment with its error code and the batch goes on", async () => {
    const { s, close } = await setup();
    try {
      const plan = await needsFor(s, [source("Fake error: tts_timeout", "Fine answer.")]);
      const result = await generateMissing(s, makeDeps(), { needs: plan.missing, limit: 20, identity, voices });
      expect(result).toEqual({ generated: 1, failed: 1, paused: false });
      const rows = await s.ttsSegment.listAll();
      const failed = rows.find((r) => r.status === "failed")!;
      expect(failed).toMatchObject({ errorCode: "tts_timeout", assetId: null, attempts: 1 });
      expect(rows.find((r) => r.status === "done")).toBeDefined();
    } finally {
      await close();
    }
  });

  it("a failed segment is updated to done when it is generated again", async () => {
    const { s, close } = await setup();
    try {
      const sources = [source("Q", "A.")];
      const flaky = { ...sources[0], question: "Fake error: tts_error" };
      const first = await needsFor(s, [flaky]);
      await generateMissing(s, makeDeps(), { needs: first.missing, limit: 20, identity, voices });
      const failedHash = (await s.ttsSegment.listAll()).find((r) => r.status === "failed")!.hash;
      const retry = (await needsFor(s, [flaky], true)).missing.filter((m) => m.hash === failedHash);
      const calm = makeDeps({ tts: createFakeTtsDriver({ sleep: async () => {} }) });
      // Same text, a driver that now succeeds: replace the control line.
      const fixed = retry.map((n) => ({ ...n }));
      const driver: TtsDriver = { name: "fake", voices: async () => [], synthesize: async () => ok({ audio: silentMp3(1500), contentType: "audio/mpeg" }) };
      const result = await generateMissing(s, { ...calm, tts: driver }, { needs: fixed, limit: 20, identity, voices });
      expect(result.generated).toBe(1);
      const rows = await s.ttsSegment.listAll();
      expect(rows.filter((r) => r.hash === failedHash)).toHaveLength(1);
      expect(rows.find((r) => r.hash === failedHash)).toMatchObject({ status: "done", errorCode: null });
    } finally {
      await close();
    }
  });

  it("a storage put that throws writes a failed segment with code storage_error and the question stays playable", async () => {
    const { s, close } = await setup();
    try {
      const broken: Storage = {
        put: async () => {
          throw new Error("disk on fire");
        },
        get: async () => null,
        delete: async () => {},
      };
      const plan = await needsFor(s, [source("Q", "A.")]);
      const result = await generateMissing(s, makeDeps({ storage: broken }), { needs: plan.missing, limit: 20, identity, voices });
      expect(result).toEqual({ generated: 0, failed: 2, paused: false });
      const rows = await s.ttsSegment.listAll();
      expect(rows.every((r) => r.status === "failed" && r.errorCode === "storage_error" && r.assetId === null)).toBe(true);
      expect(await s.asset.listAll()).toHaveLength(0);
    } finally {
      await close();
    }
  });

  it("a batch stops starting new clips after the time budget", async () => {
    const { s, close } = await setup();
    try {
      let t = NOW.getTime();
      const slow: TtsDriver = {
        name: "fake",
        voices: async () => [],
        async synthesize() {
          t += 30_000;
          return ok({ audio: silentMp3(1500), contentType: "audio/mpeg" });
        },
      };
      const plan = await needsFor(s, [source("Q1", "A1.", 1), source("Q2", "A2.", 2), source("Q3", "A3.", 3)]);
      expect(BATCH_BUDGET_MS).toBe(45_000);
      const result = await generateMissing(s, makeDeps({ tts: slow, now: () => new Date(t) }), { needs: plan.missing, limit: 20, identity, voices });
      expect(result.generated).toBe(2);
      expect(result.paused).toBe(false);
    } finally {
      await close();
    }
  });

  it("a second writer racing on one hash deletes its own stored object and leaves one asset", async () => {
    const { s, close } = await setup();
    try {
      const plan = await needsFor(s, [{ ...source("Only question", "A."), blocks: [] }]);
      const need = plan.missing[0];
      const objects = new Map<string, Uint8Array>();
      const winner: TtsDriver = {
        name: "fake",
        voices: async () => [],
        async synthesize() {
          // The other writer finishes while this one is still synthesizing.
          const asset = await s.asset.insert({ kind: "tts_segment", storageKey: "u/0000000000000000/tts/" + "a".repeat(32) + ".mp3", contentType: "audio/mpeg", bytes: 3, sha256: "s".repeat(64), durationMs: 1000 });
          await s.ttsSegment.insert({ hash: need.hash, provider: "fake", model: "fake-tts", voice: "Vivian", style: TTS_STYLE_ID, textChars: 13, assetId: asset.id, status: "done", attempts: 1 });
          return ok({ audio: silentMp3(1500), contentType: "audio/mpeg" });
        },
      };
      const deps = makeDeps({ tts: winner }, objects);
      const result = await generateMissing(s, deps, { needs: [need], limit: 20, identity, voices });
      expect(result.failed).toBe(0);
      expect(await s.asset.listAll()).toHaveLength(1);
      expect(await s.ttsSegment.listAll()).toHaveLength(1);
      expect(objects.size).toBe(0);
    } finally {
      await close();
    }
  });

  it("emits one [tts] line per segment with ids, code, provider, model, voice, ms and bytes and never the text", async () => {
    const { s, close } = await setup();
    try {
      const info = vi.spyOn(console, "info").mockImplementation(() => {});
      const secret = "Private story about a layoff.";
      const plan = await needsFor(s, [source("Fake error: tts_error", secret)]);
      await generateMissing(s, makeDeps(), { needs: plan.missing, limit: 20, identity, voices });
      const lines = info.mock.calls.filter((c) => c[0] === "[tts]");
      expect(lines).toHaveLength(plan.missing.length);
      for (const [, payload] of lines) {
        expect(Object.keys(payload as object).sort()).toEqual(["bytes", "code", "hash", "model", "ms", "provider", "voice"]);
      }
      const all = JSON.stringify(info.mock.calls);
      expect(all).not.toContain(secret);
      expect(all).not.toContain("Fake error");
      expect(lines.some(([, p]) => (p as { code: string | null }).code === "tts_error")).toBe(true);
      expect(lines.some(([, p]) => (p as { code: string | null }).code === null)).toBe(true);
    } finally {
      await close();
    }
  });

  it("does nothing without a TTS driver", async () => {
    const { s, close } = await setup();
    try {
      const plan = await needsFor(s, [source("Q", "A.")]);
      const result = await generateMissing(s, makeDeps({ tts: null }), { needs: plan.missing, limit: 20, identity, voices });
      expect(result).toEqual({ generated: 0, failed: 0, paused: false });
      expect(await s.ttsSegment.listAll()).toHaveLength(0);
    } finally {
      await close();
    }
  });
});

describe("storeUploaded", () => {
  const upload = (hash: string, over: Partial<{ contentType: string; durationMs: number | null; bytes: Uint8Array }> = {}) => ({
    hash,
    contentType: "audio/mpeg",
    durationMs: 1500,
    bytes: silentMp3(1500),
    ...over,
  });

  it("stores only planned hashes: others are rejected with not_planned", async () => {
    const { s, close } = await setup();
    try {
      const plan = await needsFor(s, [source("Q", "A.")]);
      const planned = new Set(plan.missing.map((m) => m.hash));
      const deps = makeDeps();
      const result = await storeUploaded(s, deps, {
        identity,
        voices,
        plannedHashes: planned,
        uploads: [upload(plan.missing[0].hash), upload("ffffffffffffffff")],
      });
      expect(result).toEqual({ stored: 1, skipped: 0, rejected: [{ hash: "ffffffffffffffff", reason: "not_planned" }] });
      const [row] = await s.ttsSegment.listAll();
      expect(row).toMatchObject({ hash: plan.missing[0].hash, status: "done", provider: "fake", model: "fake-tts", style: TTS_STYLE_ID, attempts: 1 });
      expect(deps.objects.size).toBe(1);
    } finally {
      await close();
    }
  });

  it("records the speaker's voice and the text length for a planned hash from the current questions", async () => {
    const { s, close } = await setup();
    try {
      const { opportunityId } = await seedBank(s, [{ question: "Tell me about yourself", say: "I design systems." }]);
      void opportunityId;
      const hash = hashOf("candidate", "I design systems.");
      await storeUploaded(s, makeDeps(), { identity, voices, plannedHashes: new Set([hash]), uploads: [upload(hash)] });
      const [row] = await s.ttsSegment.listAll();
      expect(row).toMatchObject({ voice: "Ryan", textChars: "I design systems.".length });
    } finally {
      await close();
    }
  });

  it("skips a hash that is already done and rejects a clip over 2 MB or a content type other than audio/mpeg, audio/wav, audio/ogg", async () => {
    const { s, close } = await setup();
    try {
      const plan = await needsFor(s, [source("Q one", "A one.", 1), source("Q two", "A two.", 2)]);
      const [a, b, c, d] = plan.missing;
      const planned = new Set(plan.missing.map((m) => m.hash));
      const deps = makeDeps();
      await storeUploaded(s, deps, { identity, voices, plannedHashes: planned, uploads: [upload(a.hash)] });
      const result = await storeUploaded(s, deps, {
        identity,
        voices,
        plannedHashes: planned,
        uploads: [
          upload(a.hash),
          upload(b.hash, { bytes: new Uint8Array(SEGMENT_MAX_BYTES + 1) }),
          upload(c.hash, { contentType: "audio/webm" }),
          upload(d.hash, { contentType: "audio/wav" }),
        ],
      });
      expect(result.skipped).toBe(1);
      expect(result.stored).toBe(1);
      expect(result.rejected).toEqual([
        { hash: b.hash, reason: "too_large" },
        { hash: c.hash, reason: "bad_content_type" },
      ]);
      const wavAsset = (await s.asset.listAll()).find((x) => x.contentType === "audio/wav")!;
      expect(wavAsset.storageKey.endsWith(".wav")).toBe(true);
    } finally {
      await close();
    }
  });
});

async function seedBank(s: Scoped, items: { question: string; say: string }[], key = "bank") {
  const created = expectOk(await createOpportunity(s, { companyName: "Northwind Traders", roleTitle: `Designer ${key}` }));
  const artifact = await s.artifact.insert({
    opportunityId: created.id,
    companyId: null,
    stageId: null,
    key,
    version: 1,
    kind: "question_bank",
    title: key,
    bodyMd: "x",
    contentHash: `h-${key}`,
    sourceHash: `h-${key}`,
    origin: "pushed",
  });
  await s.prepQuestion.replaceForArtifactKey(
    created.id,
    key,
    items.map((item, position) => ({
      opportunityId: created.id,
      artifactId: artifact.id,
      artifactVersion: 1,
      artifactKey: key,
      number: position + 1,
      position,
      question: item.question,
      questionKey: `qk-${position}`,
      blocks: [{ label: "Say", spoken: true, text: item.say }],
    })),
  );
  return { opportunityId: created.id, artifactId: artifact.id };
}

describe("regenerateSegment", () => {
  it("replaces the asset, deletes the old object and clears failed and suspect", async () => {
    const { s, close } = await setup();
    try {
      await seedBank(s, [{ question: "Tell me about yourself", say: "I design systems." }]);
      const hash = hashOf("candidate", "I design systems.");
      const deps = makeDeps({ tts: driverReturning({ default: 100, strict: 150 }) });
      await generateMissing(s, deps, { needs: [{ hash, speaker: "candidate", text: "I design systems." }], limit: 20, identity, voices });
      const before = (await s.ttsSegment.listByHashes([hash]))[0];
      expect(before.suspect).toBe(true);
      const oldAsset = (await s.asset.getById(before.assetId!))!;
      const good = makeDeps({ tts: driverReturning({ default: 1500, strict: 1500 }) }, deps.objects);
      const result = expectOk(await regenerateSegment(s, good, hash, identity, voices));
      expect(result).toEqual({ suspect: false });
      const after = (await s.ttsSegment.listByHashes([hash]))[0];
      expect(after).toMatchObject({ status: "done", suspect: false, errorCode: null });
      expect(after.assetId).not.toBe(before.assetId);
      expect(await s.asset.getById(oldAsset.id)).toBeNull();
      expect(deps.objects.has(oldAsset.storageKey)).toBe(false);
      expect(deps.objects.size).toBe(1);
      expect(await s.asset.listAll()).toHaveLength(1);
    } finally {
      await close();
    }
  });

  it("clears a failed segment", async () => {
    const { s, close } = await setup();
    try {
      await seedBank(s, [{ question: "Tell me about yourself", say: "I design systems." }]);
      const hash = hashOf("candidate", "I design systems.");
      await s.ttsSegment.insert({ hash, provider: "fake", model: "fake-tts", voice: "Ryan", style: TTS_STYLE_ID, textChars: 17, status: "failed", errorCode: "tts_error", attempts: 1 });
      expectOk(await regenerateSegment(s, makeDeps(), hash, identity, voices));
      expect((await s.ttsSegment.listByHashes([hash]))[0]).toMatchObject({ status: "done", errorCode: null, suspect: false });
    } finally {
      await close();
    }
  });

  it("is not_found for a hash no current question needs, and tts_error without a driver or when the driver fails", async () => {
    const { s, close } = await setup();
    try {
      await seedBank(s, [{ question: "Fake error: tts_error", say: "I design systems." }]);
      expectFail(await regenerateSegment(s, makeDeps(), "0000000000000000", identity, voices), "not_found");
      const hash = hashOf("interviewer", "Fake error: tts_error");
      expectFail(await regenerateSegment(s, makeDeps(), hash, identity, voices), "tts_error");
      const answer = hashOf("candidate", "I design systems.");
      expectFail(await regenerateSegment(s, makeDeps({ tts: null }), answer, identity, voices), "tts_error");
    } finally {
      await close();
    }
  });
});

describe("referencedHashes and deleteUnreferenced", () => {
  it("referencedHashes covers every question of every job, library items and pitch chapters", async () => {
    const { s, close } = await setup();
    try {
      await seedBank(s, [{ question: "Q one", say: "A one." }]);
      await seedBank(s, [{ question: "Q two", say: "A two." }], "bank-two");
      await s.libraryItem.insert({ kind: "answer", title: "Intro", bodyMd: "Hello from the library." });
      const job = expectOk(await createOpportunity(s, { companyName: "Acme", roleTitle: "Lead" }));
      await s.artifact.insert({
        opportunityId: job.id,
        companyId: null,
        stageId: null,
        key: "pitch",
        version: 1,
        kind: "pitch",
        title: "Pitch",
        bodyMd: "# Pitch\n\n## Short version\n\nOne sentence.",
        contentHash: "p1",
        sourceHash: "p1",
        origin: "pushed",
      });
      const refs = await referencedHashes(s, identity, voices);
      for (const [speaker, text] of [
        ["interviewer", "Q one"],
        ["candidate", "A one."],
        ["interviewer", "Q two"],
        ["candidate", "A two."],
        ["interviewer", "Intro"],
        ["candidate", "Hello from the library."],
        ["candidate", "Short version"],
        ["candidate", "One sentence."],
      ] as const) {
        expect(refs.has(hashOf(speaker, text))).toBe(true);
      }
      expect(refs.has(hashOf("candidate", "Q one"))).toBe(false);
    } finally {
      await close();
    }
  });

  it("deleteUnreferenced removes segments, asset rows and objects that no current question refers to and keeps the others", async () => {
    const { s, close } = await setup();
    try {
      const sources = [source("Q one", "A one.", 1), source("Q two", "A two.", 2)];
      const plan = await needsFor(s, sources);
      const deps = makeDeps();
      await generateMissing(s, deps, { needs: plan.missing, limit: 20, identity, voices });
      expect(deps.objects.size).toBe(4);
      const keep = new Set(plan.missing.filter((m) => m.text.endsWith("one.") || m.text === "Q one").map((m) => m.hash));
      const removed = await deleteUnreferenced(s, deps, keep);
      expect(removed).toBe(2);
      expect((await s.ttsSegment.listAll()).map((r) => r.hash).sort()).toEqual([...keep].sort());
      expect(await s.asset.listAll()).toHaveLength(2);
      expect(deps.objects.size).toBe(2);
    } finally {
      await close();
    }
  });

  it("deleteUnreferenced also removes failed segments that hold no asset", async () => {
    const { s, close } = await setup();
    try {
      await s.ttsSegment.insert({ hash: "abababababababab", provider: "fake", model: "fake-tts", voice: "x", style: TTS_STYLE_ID, textChars: 1, status: "failed", errorCode: "tts_error", attempts: 1 });
      expect(await deleteUnreferenced(s, makeDeps(), new Set())).toBe(1);
      expect(await s.ttsSegment.listAll()).toHaveLength(0);
    } finally {
      await close();
    }
  });

  it("deleteAllAudio removes every segment, asset of kind tts_segment and object of the user and no other user's", async () => {
    const { db, s, close } = await setup("delete-all-a@example.com");
    try {
      const other = scoped(db, (await createTestUser(db, "delete-all-b@example.com")).id);
      const objects = new Map<string, Uint8Array>();
      const deps = makeDeps({}, objects);
      const plan = await needsFor(s, [source("Q one", "A one.")]);
      await generateMissing(s, deps, { needs: plan.missing, limit: 20, identity, voices });
      const otherPlan = await needsFor(other, [source("Q one", "A one.")]);
      await generateMissing(other, deps, { needs: otherPlan.missing, limit: 20, identity, voices });
      await s.asset.insert({ kind: "recording", storageKey: `u/aaaaaaaaaaaaaaaa/rec/${"b".repeat(32)}.webm`, contentType: "audio/webm", bytes: 1, sha256: "r".repeat(64) });
      expect(objects.size).toBe(4);
      const removed = await deleteAllAudio(s, deps);
      expect(removed).toBe(2);
      expect(await s.ttsSegment.listAll()).toHaveLength(0);
      expect((await s.asset.listAll()).map((a) => a.kind)).toEqual(["recording"]);
      expect(objects.size).toBe(2);
      expect(await other.ttsSegment.listAll()).toHaveLength(2);
      expect(await other.asset.listAll()).toHaveLength(2);
    } finally {
      await close();
    }
  });
});

describe("markObjectMissing and lookupSegments", () => {
  it("markObjectMissing sets the segment failed with code object_missing", async () => {
    const { s, close } = await setup();
    try {
      const plan = await needsFor(s, [source("Q", "A.")]);
      await generateMissing(s, makeDeps(), { needs: plan.missing, limit: 20, identity, voices });
      const row = (await s.ttsSegment.listAll())[0];
      await markObjectMissing(s, row.assetId!);
      const after = (await s.ttsSegment.listByHashes([row.hash]))[0];
      expect(after).toMatchObject({ status: "failed", errorCode: "object_missing" });
      await markObjectMissing(s, "00000000-0000-4000-8000-000000000000");
    } finally {
      await close();
    }
  });

  it("lookupSegments returns done segments only, with suspect", async () => {
    const { s, close } = await setup();
    try {
      const deps = makeDeps({ tts: driverReturning({ default: 100, strict: 150 }) });
      const plan = await needsFor(s, [{ ...source("Q", "A."), blocks: [] }]);
      await generateMissing(s, deps, { needs: plan.missing, limit: 20, identity, voices });
      const done = (await s.ttsSegment.listAll())[0];
      await s.ttsSegment.insert({ hash: "cdcdcdcdcdcdcdcd", provider: "fake", model: "fake-tts", voice: "x", style: TTS_STYLE_ID, textChars: 1, status: "failed", errorCode: "tts_error", attempts: 1 });
      const found = await lookupSegments(s, [done.hash, "cdcdcdcdcdcdcdcd", "0000000000000000"]);
      expect([...found.keys()]).toEqual([done.hash]);
      expect(found.get(done.hash)).toEqual({ assetId: done.assetId, suspect: true });
      expect(await lookupSegments(s, [])).toEqual(new Map());
    } finally {
      await close();
    }
  });
});

describe("segment writers", () => {
  function walk(dir: string, out: string[] = []): string[] {
    for (const name of readdirSync(dir)) {
      const full = path.join(dir, name);
      if (statSync(full).isDirectory()) walk(full, out);
      else if (/\.(ts|tsx)$/.test(name)) out.push(full);
    }
    return out;
  }

  it("only lib/audio/segments.ts writes tts_segment rows and their assets", () => {
    const root = path.resolve(__dirname, "../..");
    const writers = /\b(ttsSegment\.(insert|update|deleteByIds)|asset\.(insert|delete))\b/;
    const offenders = [...walk(path.join(root, "lib")), ...walk(path.join(root, "app"))]
      .filter((file) => !file.endsWith(path.join("lib", "audio", "segments.ts")))
      .filter((file) => writers.test(readFileSync(file, "utf8")))
      .map((file) => path.relative(root, file));
    expect(offenders).toEqual([]);
  });
});
