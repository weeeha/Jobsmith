import { afterEach, describe, expect, it, vi } from "vitest";
import { makeTestDb, createTestUser } from "../helpers/db";
import { scoped } from "@/lib/db/scoped";
import type { Db } from "@/lib/db/client";
import type { BridgeDeps } from "@/lib/bridge/handlers";
import { handleAudioPlan, handleAudioUpload } from "@/lib/bridge/audio-handlers";
import { createApiToken, revokeApiToken } from "@/lib/auth/api-token";
import { defaultStages } from "@/lib/pipeline/rules";
import { MAX_PUSH_BYTES, RATE_LIMIT_PER_MINUTE } from "@/lib/bridge/wire";
import { segmentHash } from "@/lib/audio/segments";
import { createMemoryStorage } from "@/lib/storage/memory";
import { silentMp3 } from "@/lib/tts/fake";
import { CLI_TTS_IDENTITY, type TtsConfig } from "@/lib/tts/config";
import { TTS_STYLE_ID } from "@/lib/tts/driver";
import { SEGMENT_MAX_BYTES } from "@/lib/prep/values";

const BASE = "http://test.local";
const FAKE: TtsConfig = { provider: "fake", model: "fake-tts", baseUrl: null, apiKey: null };
const VOICES = { interviewer: "Vivian", candidate: "Ryan" };

afterEach(() => vi.restoreAllMocks());

function testDeps(db: Db, over: { ttsConfig?: TtsConfig | null; now?: () => Date } = {}) {
  const revalidated: string[] = [];
  const objects = new Map<string, Uint8Array>();
  let counter = 0;
  let keys = 0;
  const deps: BridgeDeps = {
    db,
    now: over.now ?? (() => new Date()),
    revalidate: (path) => revalidated.push(path),
    requestId: () => `req-${++counter}`,
    audio: {
      storage: createMemoryStorage(objects),
      ttsConfig: over.ttsConfig === undefined ? FAKE : over.ttsConfig,
      randomHex: (bytes) => (++keys).toString(16).padStart(bytes * 2, "0"),
    },
  };
  return { deps, revalidated, objects };
}

async function seedJob(db: Db, slug: string, email: string, questions = 2) {
  const user = await createTestUser(db, email);
  const s = scoped(db, user.id);
  const company = await s.company.insert({ name: "Acme Robotics", nameKey: `acme-${slug}` });
  const opportunity = await s.opportunity.insert({ companyId: company.id, slug, roleTitle: "Product Designer" });
  const stages = await s.stage.insertMany(
    defaultStages().map((d, i) => ({ opportunityId: opportunity.id, kind: d.kind, label: d.label, position: i })),
  );
  await s.opportunity.update(opportunity.id, { currentStageId: stages[0]!.id });
  const artifact = await s.artifact.insert({
    opportunityId: opportunity.id,
    companyId: null,
    stageId: null,
    key: "bank",
    version: 1,
    kind: "question_bank",
    title: "bank",
    bodyMd: "x",
    contentHash: "h",
    sourceHash: "h",
    origin: "pushed",
  });
  await s.prepQuestion.replaceForArtifactKey(
    opportunity.id,
    "bank",
    Array.from({ length: questions }, (_, i) => ({
      opportunityId: opportunity.id,
      artifactId: artifact.id,
      artifactVersion: 1,
      artifactKey: "bank",
      number: i + 1,
      position: i,
      question: `Question number ${i + 1}`,
      questionKey: `qk-${i + 1}`,
      blocks: [{ label: "Say", spoken: true, text: `Answer number ${i + 1}` }],
    })),
  );
  const created = await createApiToken(s, "Test");
  if (!created.ok) throw new Error("token setup failed");
  return { s, user, token: created.data.token, tokenId: created.data.item.id };
}

const plan = (deps: BridgeDeps, token: string | null, slug: string, query = "") =>
  handleAudioPlan(
    deps,
    new Request(`${BASE}/api/bridge/opportunities/${slug}/audio/plan${query}`, {
      headers: token ? { authorization: `Bearer ${token}` } : {},
    }),
    slug,
  );

const upload = (deps: BridgeDeps, token: string, slug: string, body: unknown, query = "") =>
  handleAudioUpload(
    deps,
    new Request(`${BASE}/api/bridge/opportunities/${slug}/audio${query}`, {
      method: "PUT",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: typeof body === "string" ? body : JSON.stringify(body),
    }),
    slug,
  );

const b64 = (bytes: Uint8Array) => Buffer.from(bytes).toString("base64");
const clip = (hash: string, bytes = silentMp3(900)) => ({ hash, contentType: "audio/mpeg", durationMs: 900, base64: b64(bytes) });

type PlanBody = {
  identity: { provider: string; model: string; style: string };
  voices: { interviewer: string; candidate: string };
  total: number;
  done: number;
  segments: { hash: string; speaker: string; text: string }[];
  requestId: string;
};

async function withDb<T>(fn: (db: Db) => Promise<T>): Promise<T> {
  const { db, close } = await makeTestDb();
  try {
    return await fn(db);
  } finally {
    await close();
  }
}

describe("GET audio plan", () => {
  it("needs a bearer token: 401 without, 401 revoked, 404 for an unknown slug", () =>
    withDb(async (db) => {
      const { s, token, tokenId } = await seedJob(db, "acme-designer", "ba1@example.com");
      const { deps } = testDeps(db);
      expect((await plan(deps, null, "acme-designer")).status).toBe(401);
      expect((await plan(deps, "jsm_" + "A".repeat(43), "acme-designer")).status).toBe(401);
      expect((await plan(deps, token, "no-such-job")).status).toBe(404);
      await revokeApiToken(s, tokenId);
      expect((await plan(deps, token, "acme-designer")).status).toBe(401);
    }));

  it("lists the missing hashes with speaker and text, the identity and the voices, and counts total and done", () =>
    withDb(async (db) => {
      const { token } = await seedJob(db, "acme-designer", "ba2@example.com");
      const { deps } = testDeps(db);
      const res = await plan(deps, token, "acme-designer");
      expect(res.status).toBe(200);
      const body = (await res.json()) as PlanBody;
      expect(body.identity).toEqual({ provider: "fake", model: "fake-tts", style: TTS_STYLE_ID });
      expect(body.voices).toEqual(VOICES);
      expect(body.total).toBe(4);
      expect(body.done).toBe(0);
      expect(body.segments).toHaveLength(4);
      const q1 = body.segments.find((x) => x.text === "Question number 1")!;
      expect(q1.speaker).toBe("interviewer");
      expect(q1.hash).toBe(
        segmentHash({ provider: "fake", model: "fake-tts", voice: "Vivian", style: TTS_STYLE_ID, spokenText: "Question number 1" }),
      );
      expect(body.segments.find((x) => x.text === "Answer number 1")!.speaker).toBe("candidate");
      expect(body.requestId).toBe("req-1");
    }));

  it("skips done clips", () =>
    withDb(async (db) => {
      const { token } = await seedJob(db, "acme-designer", "ba3@example.com");
      const { deps } = testDeps(db);
      const first = (await (await plan(deps, token, "acme-designer")).json()) as PlanBody;
      await upload(deps, token, "acme-designer", { segments: [clip(first.segments[0]!.hash)] });
      const second = (await (await plan(deps, token, "acme-designer")).json()) as PlanBody;
      expect(second.done).toBe(1);
      expect(second.total).toBe(4);
      expect(second.segments.map((x) => x.hash)).not.toContain(first.segments[0]!.hash);
      expect(second.segments).toHaveLength(3);
    }));

  it("uses the server's TTS identity when TTS is on and CLI_TTS_IDENTITY when off", () =>
    withDb(async (db) => {
      const { token } = await seedJob(db, "acme-designer", "ba4@example.com");
      const on = (await (await plan(testDeps(db).deps, token, "acme-designer")).json()) as PlanBody;
      expect(on.identity.provider).toBe("fake");
      const off = (await (await plan(testDeps(db, { ttsConfig: null }).deps, token, "acme-designer")).json()) as PlanBody;
      expect({ provider: off.identity.provider, model: off.identity.model }).toEqual(CLI_TTS_IDENTITY);
      expect(off.segments[0]!.hash).not.toBe(on.segments[0]!.hash);
    }));

  it("voice query parameters override the saved voices, which override the defaults", () =>
    withDb(async (db) => {
      const { s, token } = await seedJob(db, "acme-designer", "ba5@example.com");
      const { deps } = testDeps(db);
      await s.profile.upsert({
        prep: { version: 1, voices: { interviewer: "Aria", candidate: null }, speed: 1, gapFactor: 1, browserVoices: { interviewer: null, candidate: null } },
      });
      const saved = (await (await plan(deps, token, "acme-designer")).json()) as PlanBody;
      expect(saved.voices).toEqual({ interviewer: "Aria", candidate: "Ryan" });
      const query = (await (await plan(deps, token, "acme-designer", "?voice_interviewer=Zed&voice_candidate=Yan")).json()) as PlanBody;
      expect(query.voices).toEqual({ interviewer: "Zed", candidate: "Yan" });
      expect(query.segments[0]!.hash).not.toBe(saved.segments[0]!.hash);
    }));
});

describe("PUT audio", () => {
  it("stores a planned clip: an object in storage, an asset row, a done segment", () =>
    withDb(async (db) => {
      const { s, token } = await seedJob(db, "acme-designer", "bp1@example.com");
      const { deps, objects } = testDeps(db);
      const body = (await (await plan(deps, token, "acme-designer")).json()) as PlanBody;
      const target = body.segments[0]!;
      const res = await upload(deps, token, "acme-designer", { segments: [clip(target.hash)] });
      expect(res.status).toBe(200);
      const result = await res.json();
      expect(result).toMatchObject({ stored: 1, skipped: 0, rejected: [] });
      expect(result.requestId).toMatch(/^req-/);
      expect(objects.size).toBe(1);
      const assets = await s.asset.listAll();
      expect(assets).toHaveLength(1);
      expect(assets[0]!.kind).toBe("tts_segment");
      const row = (await s.ttsSegment.listByHashes([target.hash]))[0]!;
      expect(row.status).toBe("done");
      expect(row.assetId).toBe(assets[0]!.id);
    }));

  it("rejects a hash that is not in the current plan with not_planned and stores the rest", () =>
    withDb(async (db) => {
      const { s, token } = await seedJob(db, "acme-designer", "bp2@example.com");
      const { deps } = testDeps(db);
      const body = (await (await plan(deps, token, "acme-designer")).json()) as PlanBody;
      const res = await upload(deps, token, "acme-designer", { segments: [clip("ffffffffffffffff"), clip(body.segments[1]!.hash)] });
      const result = await res.json();
      expect(result.stored).toBe(1);
      expect(result.rejected).toEqual([{ hash: "ffffffffffffffff", reason: "not_planned" }]);
      expect(await s.ttsSegment.listAll()).toHaveLength(1);
    }));

  it("is idempotent: a second upload of the same clips reports them skipped", () =>
    withDb(async (db) => {
      const { token } = await seedJob(db, "acme-designer", "bp3@example.com");
      const { deps, objects } = testDeps(db);
      const body = (await (await plan(deps, token, "acme-designer")).json()) as PlanBody;
      const segments = body.segments.map((x) => clip(x.hash));
      expect((await (await upload(deps, token, "acme-designer", { segments })).json()).stored).toBe(4);
      const again = await (await upload(deps, token, "acme-designer", { segments })).json();
      expect(again).toMatchObject({ stored: 0, skipped: 4, rejected: [] });
      expect(objects.size).toBe(4);
    }));

  it("51 segments is 413 too_many_segments", () =>
    withDb(async (db) => {
      const { token } = await seedJob(db, "acme-designer", "bp4@example.com");
      const { deps } = testDeps(db);
      const res = await upload(deps, token, "acme-designer", { segments: Array.from({ length: 51 }, () => clip("0123456789abcdef", new Uint8Array(4))) });
      expect(res.status).toBe(413);
      const body = await res.json();
      expect(body.error.code).toBe("too_many_segments");
      expect(body.error.message).toBe("An audio upload holds at most 50 clips.");
    }));

  it("a body over 4 MB is 413 payload_too_large", () =>
    withDb(async (db) => {
      const { token } = await seedJob(db, "acme-designer", "bp5@example.com");
      const { deps } = testDeps(db);
      const res = await upload(deps, token, "acme-designer", "x".repeat(MAX_PUSH_BYTES + 1));
      expect(res.status).toBe(413);
      expect((await res.json()).error.code).toBe("payload_too_large");
    }));

  it("invalid base64 or a clip over 2 MB is rejected per segment without failing the request", () =>
    withDb(async (db) => {
      const { token } = await seedJob(db, "acme-designer", "bp6@example.com");
      const { deps } = testDeps(db);
      const body = (await (await plan(deps, token, "acme-designer")).json()) as PlanBody;
      const [a, b, c] = body.segments;
      const big = new Uint8Array(SEGMENT_MAX_BYTES + 1);
      const res = await upload(deps, token, "acme-designer", {
        segments: [
          { ...clip(a!.hash), base64: "not base64 !!!" },
          clip(b!.hash, big),
          clip(c!.hash),
        ],
      });
      expect(res.status).toBe(200);
      const result = await res.json();
      expect(result.stored).toBe(1);
      expect(result.rejected).toEqual(
        expect.arrayContaining([
          { hash: a!.hash, reason: "bad_base64" },
          { hash: b!.hash, reason: "too_large" },
        ]),
      );
      expect(result.rejected).toHaveLength(2);
    }));

  it("an unplayable content type is rejected per segment", () =>
    withDb(async (db) => {
      const { token } = await seedJob(db, "acme-designer", "bp6b@example.com");
      const { deps } = testDeps(db);
      const body = (await (await plan(deps, token, "acme-designer")).json()) as PlanBody;
      const res = await upload(deps, token, "acme-designer", { segments: [{ ...clip(body.segments[0]!.hash), contentType: "text/html" }] });
      expect((await res.json()).rejected).toEqual([{ hash: body.segments[0]!.hash, reason: "bad_content_type" }]);
    }));

  it("counts against the same per-token rate limit as push", () =>
    withDb(async (db) => {
      const { token } = await seedJob(db, "acme-designer", "bp7@example.com");
      const fixed = new Date("2026-10-01T10:00:05.000Z");
      const { deps } = testDeps(db, { now: () => fixed });
      for (let i = 0; i < RATE_LIMIT_PER_MINUTE; i += 1) {
        expect((await plan(deps, token, "acme-designer")).status).toBe(200);
      }
      const over = await upload(deps, token, "acme-designer", { segments: [clip("0123456789abcdef")] });
      expect(over.status).toBe(429);
      expect((await over.json()).error.code).toBe("rate_limited");
    }));

  it("revalidates the job page when something was stored, and not otherwise", () =>
    withDb(async (db) => {
      const { token } = await seedJob(db, "acme-designer", "bp8@example.com");
      const { deps, revalidated } = testDeps(db);
      const body = (await (await plan(deps, token, "acme-designer")).json()) as PlanBody;
      await upload(deps, token, "acme-designer", { segments: [clip("ffffffffffffffff")] });
      expect(revalidated).toEqual([]);
      await upload(deps, token, "acme-designer", { segments: [clip(body.segments[0]!.hash)] });
      expect(revalidated).toEqual(["/jobs/acme-designer"]);
    }));

  it("another user's job slug is 404 and nothing is stored", () =>
    withDb(async (db) => {
      const owner = await seedJob(db, "acme-designer", "bp9-owner@example.com");
      const other = await seedJob(db, "other-job", "bp9-other@example.com");
      const { deps, objects } = testDeps(db);
      const body = (await (await plan(deps, owner.token, "acme-designer")).json()) as PlanBody;
      const res = await upload(deps, other.token, "acme-designer", { segments: [clip(body.segments[0]!.hash)] });
      expect(res.status).toBe(404);
      expect(objects.size).toBe(0);
      expect(await owner.s.ttsSegment.listAll()).toHaveLength(0);
      expect(await other.s.ttsSegment.listAll()).toHaveLength(0);
    }));

  it("an invalid body is 400 invalid_payload", () =>
    withDb(async (db) => {
      const { token } = await seedJob(db, "acme-designer", "bp10@example.com");
      const { deps } = testDeps(db);
      const res = await upload(deps, token, "acme-designer", { segments: [{ hash: "zz" }] });
      expect(res.status).toBe(400);
      expect((await res.json()).error.code).toBe("invalid_payload");
    }));
});
