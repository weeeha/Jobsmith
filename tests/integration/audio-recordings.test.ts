import { createHash } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import { makeTestDb, createTestUser } from "../helpers/db";
import { scoped } from "@/lib/db/scoped";
import { createOpportunity } from "@/lib/pipeline/create";
import { deleteRecording, listRecordings, recordingsForJob, storeRecording } from "@/lib/audio/recordings";
import { handleRecordingUpload } from "@/lib/audio/recording-upload";
import { serveAsset } from "@/lib/audio/serve";
import { startSession } from "@/lib/prep/sessions";
import { RECORDING_MAX_BYTES } from "@/lib/prep/values";
import { userPrefix } from "@/lib/storage/keys";
import { createMemoryStorage } from "@/lib/storage/memory";
import { expectFail, expectOk } from "../helpers/result";

const closers: (() => Promise<void>)[] = [];
afterEach(async () => {
  while (closers.length) await closers.pop()!();
});

const QUESTION = "00000000000000a1";
const OTHER_QUESTION = "00000000000000a2";
let counter = 0;

async function setup(email = "rec-a@example.com") {
  const { db, close } = await makeTestDb();
  closers.push(close);
  const user = await createTestUser(db, email);
  const s = scoped(db, user.id);
  const opportunityId = expectOk(await createOpportunity(s, { companyName: "Northwind Traders", roleTitle: "Designer" })).id;
  const artifact = await s.artifact.insert({
    opportunityId, companyId: null, stageId: null, key: "bank", version: 1, kind: "question_bank",
    title: "Bank", bodyMd: "x", contentHash: "h", sourceHash: "h", origin: "pushed",
  });
  await s.prepQuestion.replaceForArtifactKey(
    opportunityId,
    "bank",
    [QUESTION, OTHER_QUESTION].map((questionKey, i) => ({
      opportunityId, artifactId: artifact.id, artifactVersion: 1, artifactKey: "bank", number: i + 1, position: i,
      section: null, question: `Question ${i + 1}`, questionKey, hasAnswer: true,
      blocks: [{ label: "Say", spoken: true, text: "Answer" }],
    })),
  );
  const sessionId = expectOk(await startSession(s, { opportunityId, mode: "drill", questions: 2 })).id;
  const objects = new Map<string, Uint8Array>();
  const deps = { storage: createMemoryStorage(objects), randomHex: (bytes: number) => (++counter).toString(16).padStart(bytes * 2, "0") };
  return { s, user, opportunityId, sessionId, objects, deps };
}

const bytes = (n: number) => Uint8Array.from({ length: n }, (_, i) => i % 251);
const NOW = new Date("2026-11-21T12:00:00Z");

async function store(ctx: Awaited<ReturnType<typeof setup>>, over: Partial<Parameters<typeof storeRecording>[2]> = {}) {
  return storeRecording(ctx.s, ctx.deps, {
    opportunityId: ctx.opportunityId,
    sessionId: ctx.sessionId,
    questionKey: QUESTION,
    contentType: "audio/webm",
    bytes: bytes(2000),
    now: NOW,
    ...over,
  });
}

describe("storeRecording", () => {
  it("writes an object under u/<hash>/rec/<random>.webm, an asset of kind recording attached to the job, and a meta entry on the session", async () => {
    const ctx = await setup();
    const { assetId } = expectOk(await store(ctx));
    const asset = (await ctx.s.asset.getById(assetId))!;
    expect(asset).toMatchObject({ kind: "recording", contentType: "audio/webm", bytes: 2000, opportunityId: ctx.opportunityId });
    expect(asset.storageKey.startsWith(`${userPrefix(ctx.user.id)}rec/`)).toBe(true);
    expect(asset.storageKey).toMatch(/\/rec\/[0-9a-f]{32}\.webm$/);
    expect(asset.sha256).toBe(createHash("sha256").update(bytes(2000)).digest("hex"));
    expect(ctx.objects.get(asset.storageKey)).toEqual(bytes(2000));
    const session = (await ctx.s.prepSession.getById(ctx.sessionId))!;
    expect(session.meta).toMatchObject({ recordings: [{ questionKey: QUESTION, assetId, createdAt: NOW.toISOString() }] });
  });

  it("keeps the session's other meta and takes the extension from the content type, ignoring codecs", async () => {
    const ctx = await setup();
    await ctx.s.prepSession.update(ctx.sessionId, { meta: { order: ["x"] } });
    const mp4 = expectOk(await store(ctx, { contentType: "audio/mp4" }));
    const ogg = expectOk(await store(ctx, { contentType: "audio/ogg;codecs=opus" }));
    const webm = expectOk(await store(ctx, { contentType: "Audio/WebM; codecs=opus" }));
    const keys = await Promise.all([mp4, ogg, webm].map(async (r) => (await ctx.s.asset.getById(r.assetId))!.storageKey));
    expect(keys.map((k) => k.split(".").pop())).toEqual(["mp4", "ogg", "webm"]);
    const session = (await ctx.s.prepSession.getById(ctx.sessionId))!;
    expect(session.meta).toMatchObject({ order: ["x"] });
    expect((session.meta as { recordings: unknown[] }).recordings).toHaveLength(3);
  });

  it("rejects a content type other than audio/webm, audio/mp4 and audio/ogg, an empty body and a body over 8 MB", async () => {
    const ctx = await setup();
    expectFail(await store(ctx, { contentType: "audio/mpeg" }), "invalid");
    expectFail(await store(ctx, { contentType: "text/html" }), "invalid");
    expectFail(await store(ctx, { bytes: new Uint8Array(0) }), "invalid");
    expectFail(await store(ctx, { bytes: new Uint8Array(RECORDING_MAX_BYTES + 1) }), "too_large");
    expectOk(await store(ctx, { bytes: new Uint8Array(RECORDING_MAX_BYTES) }));
    expect(ctx.objects.size).toBe(1);
  });

  it("another user's job or session is not_found and nothing is stored", async () => {
    const mine = await setup("rec-b@example.com");
    const other = await setup("rec-c@example.com");
    const result = await storeRecording(other.s, other.deps, {
      opportunityId: mine.opportunityId, sessionId: mine.sessionId, questionKey: QUESTION, contentType: "audio/webm", bytes: bytes(10),
    });
    expectFail(result, "not_found");
    const wrongSession = await storeRecording(other.s, other.deps, {
      opportunityId: other.opportunityId, sessionId: mine.sessionId, questionKey: QUESTION, contentType: "audio/webm", bytes: bytes(10),
    });
    expectFail(wrongSession, "not_found");
    // A question that is not in the job.
    expectFail(await store(mine, { questionKey: "00000000000000ff" }), "not_found");
    // A session of another job.
    const otherJob = expectOk(await createOpportunity(mine.s, { companyName: "Other Co", roleTitle: "Designer" })).id;
    expectFail(await store(mine, { opportunityId: otherJob }), "not_found");
    expect(mine.objects.size + other.objects.size).toBe(0);
    expect(await other.s.asset.listAll()).toHaveLength(0);
    expect(await mine.s.asset.listAll()).toHaveLength(0);
  });

  it("stores nothing in the database when the object cannot be written", async () => {
    const ctx = await setup();
    const broken = {
      ...ctx.deps,
      storage: { ...ctx.deps.storage, put: async () => { throw new Error("storage down"); } },
    };
    await expect(
      storeRecording(ctx.s, broken, { opportunityId: ctx.opportunityId, sessionId: ctx.sessionId, questionKey: QUESTION, contentType: "audio/webm", bytes: bytes(5) }),
    ).rejects.toThrow("storage down");
    expect(await ctx.s.asset.listAll()).toHaveLength(0);
    expect((await ctx.s.prepSession.getById(ctx.sessionId))!.meta).toEqual({});
  });
});

describe("listRecordings", () => {
  it("returns a question's recordings across the job's sessions, newest first", async () => {
    const ctx = await setup();
    const second = expectOk(await startSession(ctx.s, { opportunityId: ctx.opportunityId, mode: "drill", questions: 1 })).id;
    const a = expectOk(await store(ctx, { now: new Date("2026-11-21T10:00:00Z") })).assetId;
    const b = expectOk(await store(ctx, { sessionId: second, now: new Date("2026-11-22T10:00:00Z") })).assetId;
    const c = expectOk(await store(ctx, { now: new Date("2026-11-21T11:00:00Z") })).assetId;
    expectOk(await store(ctx, { questionKey: OTHER_QUESTION }));
    const list = await listRecordings(ctx.s, ctx.opportunityId, QUESTION);
    expect(list.map((r) => r.assetId)).toEqual([b, c, a]);
    expect(list[0].createdAt).toEqual(new Date("2026-11-22T10:00:00Z"));
    const byJob = await recordingsForJob(ctx.s, ctx.opportunityId);
    expect(byJob.get(QUESTION)).toHaveLength(3);
    expect(byJob.get(OTHER_QUESTION)).toHaveLength(1);
  });

  it("leaves out an entry whose asset is gone", async () => {
    const ctx = await setup();
    const { assetId } = expectOk(await store(ctx));
    await ctx.s.asset.delete(assetId);
    expect(await listRecordings(ctx.s, ctx.opportunityId, QUESTION)).toEqual([]);
  });
});

describe("deleteRecording", () => {
  it("removes the object, the asset row and the meta entry", async () => {
    const ctx = await setup();
    const keep = expectOk(await store(ctx)).assetId;
    const drop = expectOk(await store(ctx)).assetId;
    const storageKey = (await ctx.s.asset.getById(drop))!.storageKey;
    expectOk(await deleteRecording(ctx.s, ctx.deps, drop));
    expect(await ctx.s.asset.getById(drop)).toBeNull();
    expect(ctx.objects.has(storageKey)).toBe(false);
    const session = (await ctx.s.prepSession.getById(ctx.sessionId))!;
    expect((session.meta as { recordings: { assetId: string }[] }).recordings.map((r) => r.assetId)).toEqual([keep]);
  });

  it("is not_found for a missing id, for another user's recording and for an asset that is not a recording", async () => {
    const mine = await setup("rec-d@example.com");
    const other = await setup("rec-e@example.com");
    const { assetId } = expectOk(await store(mine));
    expectFail(await deleteRecording(other.s, other.deps, assetId), "not_found");
    expectFail(await deleteRecording(mine.s, mine.deps, "11111111-1111-4111-8111-111111111111"), "not_found");
    const clip = await mine.s.asset.insert({ kind: "tts_segment", storageKey: "u/x/tts/one.mp3", contentType: "audio/mpeg", bytes: 1, sha256: "x", durationMs: 1 });
    expectFail(await deleteRecording(mine.s, mine.deps, clip.id), "not_found");
    expect(await mine.s.asset.getById(assetId)).not.toBeNull();
  });
});

describe("serving a recording", () => {
  it("serves a recording to its owner and 404 to another user", async () => {
    const mine = await setup("rec-f@example.com");
    const other = await setup("rec-g@example.com");
    const { assetId } = expectOk(await store(mine));
    const ok = await serveAsset(mine.s, mine.deps.storage, assetId, null);
    expect(ok.status).toBe(200);
    expect(ok.headers.get("content-type")).toBe("audio/webm");
    expect(new Uint8Array(await ok.arrayBuffer())).toEqual(bytes(2000));
    const denied = await serveAsset(other.s, mine.deps.storage, assetId, null);
    expect(denied.status).toBe(404);
  });
});

describe("handleRecordingUpload", () => {
  function upload(ctx: Awaited<ReturnType<typeof setup>>, parts: { file?: Blob | null; fields?: Record<string, string> } = {}, headers: Record<string, string> = {}) {
    const form = new FormData();
    const fields = { opportunityId: ctx.opportunityId, sessionId: ctx.sessionId, questionKey: QUESTION, ...parts.fields };
    for (const [k, v] of Object.entries(fields)) form.set(k, v);
    if (parts.file !== null) form.set("file", parts.file ?? new Blob([bytes(300)], { type: "audio/webm;codecs=opus" }), "answer.webm");
    return handleRecordingUpload(ctx.s, ctx.deps, new Request("http://localhost/api/assets", { method: "POST", body: form, headers }));
  }

  it("answers 201 with the asset id and stores the recording", async () => {
    const ctx = await setup();
    const res = await upload(ctx);
    expect(res.status).toBe(201);
    const { assetId } = (await res.json()) as { assetId: string };
    expect((await ctx.s.asset.getById(assetId))?.kind).toBe("recording");
  });

  it("answers 400 for a type other than audio/webm, audio/mp4 and audio/ogg", async () => {
    const ctx = await setup();
    const res = await upload(ctx, { file: new Blob([bytes(10)], { type: "audio/mpeg" }) });
    expect(res.status).toBe(400);
    expect(ctx.objects.size).toBe(0);
  });

  it("answers 400 when a field or the file is missing", async () => {
    const ctx = await setup();
    expect((await upload(ctx, { file: null })).status).toBe(400);
    expect((await upload(ctx, { fields: { questionKey: "" } })).status).toBe(400);
  });

  it("answers 413 over 8 MB, by the declared length and by the bytes actually sent", async () => {
    const ctx = await setup();
    const big = new Blob([new Uint8Array(RECORDING_MAX_BYTES + 1)], { type: "audio/webm" });
    expect((await upload(ctx, { file: big })).status).toBe(413);
    // A body that lies about its length is still counted as it streams.
    const lie = await upload(ctx, { file: big }, { "content-length": "100" });
    expect(lie.status).toBe(413);
    expect(ctx.objects.size).toBe(0);
  });

  it("answers 404 for another user's job", async () => {
    const mine = await setup("rec-h@example.com");
    const other = await setup("rec-i@example.com");
    const res = await upload(other, { fields: { opportunityId: mine.opportunityId, sessionId: mine.sessionId } });
    expect(res.status).toBe(404);
  });
});
