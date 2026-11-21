import { afterEach, describe, expect, it, vi } from "vitest";
import type { Db } from "@/lib/db/client";
import { scoped, type Scoped } from "@/lib/db/scoped";
import { createOpportunity } from "@/lib/pipeline/create";
import { deleteAudioAction, prepareAudioAction, regenerateClipAction } from "@/app/(app)/jobs/[slug]/audio-actions";
import type { AudioDeps } from "@/lib/audio/deps";
import { planSegments, referencedHashes } from "@/lib/audio/segments";
import { sourcesForJob } from "@/lib/prep/audio-status";
import { createFakeTtsDriver } from "@/lib/tts/fake";
import { createMemoryStorage } from "@/lib/storage/memory";
import { ok } from "@/lib/result";
import type { TtsConfig } from "@/lib/tts/config";
import type { TtsDriver } from "@/lib/tts/driver";
import { silentMp3 } from "@/lib/tts/fake";
import { makeTestDb, createTestUser } from "../helpers/db";
import { expectFail, expectOk } from "../helpers/result";

const harness = vi.hoisted(() => ({
  db: undefined as Db | undefined,
  userId: "",
  tts: null as TtsConfig | null,
  deps: undefined as AudioDeps | undefined,
}));

vi.mock("@/lib/auth/session", () => ({ requireUser: async () => ({ id: harness.userId }) }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/db/scoped", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/db/scoped")>();
  return { ...actual, scopedFor: (userId: string) => actual.scoped(harness.db!, userId) };
});
vi.mock("@/lib/env", () => ({ env: () => ({ TTS: harness.tts }) }));
vi.mock("@/lib/audio/deps", () => ({ audioDeps: () => harness.deps }));

afterEach(() => vi.restoreAllMocks());

const FAKE_CONFIG: TtsConfig = { provider: "fake", model: "fake-tts", baseUrl: null, apiKey: null };
let counter = 0;

function makeDeps(tts: TtsDriver | null = createFakeTtsDriver({ sleep: async () => {} })): AudioDeps {
  return {
    tts,
    storage: createMemoryStorage(new Map()),
    now: () => new Date("2026-11-21T12:00:00Z"),
    randomHex: (bytes) => (++counter).toString(16).padStart(bytes * 2, "0"),
  };
}

async function signIn(db: Db, email: string, ttsOn = true): Promise<Scoped> {
  harness.db = db;
  const user = await createTestUser(db, email);
  harness.userId = user.id;
  harness.tts = ttsOn ? FAKE_CONFIG : null;
  harness.deps = makeDeps(ttsOn ? undefined : null);
  return scoped(db, user.id);
}

// 22 questions, each with a distinct Say text: 22 + 22 = 44 clips (the Say label is not spoken as a step).
async function jobWithQuestions(s: Scoped, count = 22, key = "bank") {
  const opportunityId = expectOk(await createOpportunity(s, { companyName: "Northwind Traders", roleTitle: "Designer" })).id;
  const artifact = await s.artifact.insert({
    opportunityId,
    companyId: null,
    stageId: null,
    key,
    version: 1,
    kind: "question_bank",
    title: key,
    bodyMd: "x",
    contentHash: "h",
    sourceHash: "h",
    origin: "pushed",
  });
  await s.prepQuestion.replaceForArtifactKey(
    opportunityId,
    key,
    Array.from({ length: count }, (_, i) => ({
      opportunityId,
      artifactId: artifact.id,
      artifactVersion: 1,
      artifactKey: key,
      number: i + 1,
      position: i,
      question: `Question number ${i + 1}`,
      questionKey: `qk-${key}-${i + 1}`,
      blocks: [{ label: "Say", spoken: true, text: `Answer number ${i + 1}` }],
    })),
  );
  return opportunityId;
}

describe("audio actions", () => {
  it("prepareAudioAction generates up to 20 clips per call and returns done and total", async () => {
    const { db, close } = await makeTestDb();
    try {
      const s = await signIn(db, "audio-a1@example.com");
      const opportunityId = await jobWithQuestions(s);
      const seen: number[] = [];
      for (let i = 0; i < 3; i += 1) {
        const data = expectOk(await prepareAudioAction(opportunityId, null));
        expect(data.total).toBe(44);
        expect(data.paused).toBe(false);
        seen.push(data.done);
      }
      expect(seen).toEqual([20, 40, 44]);
    } finally {
      await close();
    }
  });

  it("scopes a call to one bank when a document key is given", async () => {
    const { db, close } = await makeTestDb();
    try {
      const s = await signIn(db, "audio-a1b@example.com");
      const opportunityId = await jobWithQuestions(s, 3, "bank-a");
      const other = await s.artifact.insert({
        opportunityId,
        companyId: null,
        stageId: null,
        key: "bank-b",
        version: 1,
        kind: "question_bank",
        title: "b",
        bodyMd: "x",
        contentHash: "h2",
        sourceHash: "h2",
        origin: "pushed",
      });
      await s.prepQuestion.replaceForArtifactKey(opportunityId, "bank-b", [
        {
          opportunityId,
          artifactId: other.id,
          artifactVersion: 1,
          artifactKey: "bank-b",
          number: 1,
          position: 0,
          question: "Another question",
          questionKey: "qk-b-1",
          blocks: [{ label: "Say", spoken: true, text: "Another answer" }],
        },
      ]);
      const data = expectOk(await prepareAudioAction(opportunityId, "bank-a"));
      expect(data.total).toBe(6);
      expect(data.done).toBe(6);
    } finally {
      await close();
    }
  });

  it("prepareAudioAction with TTS off returns tts_off and writes nothing", async () => {
    const { db, close } = await makeTestDb();
    try {
      const s = await signIn(db, "audio-a2@example.com", false);
      const opportunityId = await jobWithQuestions(s, 3);
      expectFail(await prepareAudioAction(opportunityId, null), "tts_off");
      expect(await s.ttsSegment.listAll()).toHaveLength(0);
      expect(await s.asset.listAll()).toHaveLength(0);
    } finally {
      await close();
    }
  });

  it("a rate-limited batch returns paused true", async () => {
    const { db, close } = await makeTestDb();
    try {
      const s = await signIn(db, "audio-a3@example.com");
      harness.deps = makeDeps({
        name: "fake",
        async synthesize() {
          return { ok: false, code: "tts_rate_limited", message: "slow down" };
        },
        async voices() {
          return [];
        },
      });
      const opportunityId = await jobWithQuestions(s, 3);
      const data = expectOk(await prepareAudioAction(opportunityId, null));
      expect(data.paused).toBe(true);
      expect(data.done).toBe(0);
    } finally {
      await close();
    }
  });

  it("another user's job id is not_found", async () => {
    const { db, close } = await makeTestDb();
    try {
      const owner = await signIn(db, "audio-a4-owner@example.com");
      const opportunityId = await jobWithQuestions(owner, 3);
      await signIn(db, "audio-a4-other@example.com");
      expectFail(await prepareAudioAction(opportunityId, null), "not_found");
      expectFail(await prepareAudioAction("not-a-uuid", null), "not_found");
    } finally {
      await close();
    }
  });

  it("deleteAudioAction removes only segments no current question of any job needs", async () => {
    const { db, close } = await makeTestDb();
    try {
      const s = await signIn(db, "audio-a5@example.com");
      const opportunityId = await jobWithQuestions(s, 3);
      expectOk(await prepareAudioAction(opportunityId, null));
      const before = (await s.ttsSegment.listAll()).length;
      expect(before).toBe(6);
      expect(expectOk(await deleteAudioAction()).deleted).toBe(0);
      // Drop one question: its two clips are now unreferenced.
      const rows = await s.prepQuestion.listForJob(opportunityId);
      const kept = rows.slice(0, 2);
      await s.prepQuestion.replaceForArtifactKey(
        opportunityId,
        "bank",
        kept.map((r) => ({
          opportunityId,
          artifactId: r.artifactId,
          artifactVersion: 1,
          artifactKey: "bank",
          number: r.number,
          position: r.position,
          question: r.question,
          questionKey: r.questionKey,
          blocks: r.blocks,
        })),
      );
      expect(expectOk(await deleteAudioAction()).deleted).toBe(2);
      expect(await s.ttsSegment.listAll()).toHaveLength(4);
    } finally {
      await close();
    }
  });

  it("regenerateClipAction replaces a suspect clip", async () => {
    const { db, close } = await makeTestDb();
    try {
      const s = await signIn(db, "audio-a6@example.com");
      const opportunityId = await jobWithQuestions(s, 1);
      // First run: every clip is far too short for its text, so each is kept as suspect.
      harness.deps = makeDeps({
        name: "fake",
        async synthesize() {
          return ok({ audio: silentMp3(100), contentType: "audio/mpeg" });
        },
        async voices() {
          return [];
        },
      });
      expectOk(await prepareAudioAction(opportunityId, null));
      const sources = await sourcesForJob(s, opportunityId, null);
      const identity = { provider: "fake", model: "fake-tts" };
      const voices = { interviewer: "Vivian", candidate: "Ryan" };
      const plan = await planSegments(s, { sources, identity, voices });
      expect(plan.suspect).toBeGreaterThan(0);
      const hashes = [...(await referencedHashes(s, identity, voices))];
      const suspectRow = (await s.ttsSegment.listByHashes(hashes)).find((r) => r.suspect)!;
      harness.deps = makeDeps();
      const result = expectOk(await regenerateClipAction(opportunityId, suspectRow.hash));
      expect(result.suspect).toBe(false);
      const after = (await s.ttsSegment.listByHashes([suspectRow.hash]))[0];
      expect(after.suspect).toBe(false);
      expect(after.assetId).not.toBe(suspectRow.assetId);
    } finally {
      await close();
    }
  });
});
