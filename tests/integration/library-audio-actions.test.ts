import { afterEach, describe, expect, it, vi } from "vitest";
import type { Db } from "@/lib/db/client";
import { scoped, type Scoped } from "@/lib/db/scoped";
import { ensureLibraryAudioAction } from "@/app/(app)/library/audio-actions";
import type { AudioDeps } from "@/lib/audio/deps";
import { createLibraryItem } from "@/lib/library/items";
import { loadLibraryDrillData } from "@/lib/library/drill";
import { audioContext } from "@/lib/prep/audio-status";
import { questionKey } from "@/lib/prep/question-key";
import { createFakeTtsDriver } from "@/lib/tts/fake";
import { createMemoryStorage } from "@/lib/storage/memory";
import type { TtsConfig } from "@/lib/tts/config";
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

function makeDeps(on: boolean): AudioDeps {
  return {
    tts: on ? createFakeTtsDriver({ sleep: async () => {} }) : null,
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
  harness.deps = makeDeps(ttsOn);
  return scoped(db, user.id);
}

async function addItem(s: Scoped, title: string, body = `Body of ${title}`) {
  return expectOk(await createLibraryItem(s, { kind: "answer", title, bodyMd: body, tags: [] }, { questionKey: questionKey(title) }));
}

describe("ensureLibraryAudioAction", () => {
  it("generates the ask and say clips for the given items and returns asset ids", async () => {
    const { db, close } = await makeTestDb();
    try {
      const s = await signIn(db, "la-a@example.com");
      await addItem(s, "First title");
      await addItem(s, "Second title");
      const keys = [questionKey("First title"), questionKey("Second title")];
      const data = expectOk(await ensureLibraryAudioAction(keys));
      expect(Object.keys(data.clips).sort()).toEqual([...keys].sort());
      for (const key of keys) {
        expect(data.clips[key].askAssetId).toMatch(/^[0-9a-f-]{36}$/);
        expect(data.clips[key].sayAssetId).toMatch(/^[0-9a-f-]{36}$/);
      }
      expect(await s.ttsSegment.listAll()).toHaveLength(4);
      // The drill loader now finds the same clips by hash.
      const context = await audioContext(s, harness.deps!, harness.tts);
      const drill = expectOk(await loadLibraryDrillData(s, { count: null, audio: context }));
      for (const q of drill.questions) {
        expect(q.ask.clip?.assetId).toBe(data.clips[q.questionKey].askAssetId);
        expect(q.say[0].clip?.assetId).toBe(data.clips[q.questionKey].sayAssetId);
      }
    } finally {
      await close();
    }
  });

  it("with TTS off returns an empty map and writes nothing", async () => {
    const { db, close } = await makeTestDb();
    try {
      const s = await signIn(db, "la-b@example.com", false);
      await addItem(s, "Quiet title");
      const data = expectOk(await ensureLibraryAudioAction([questionKey("Quiet title")]));
      expect(data.clips).toEqual({});
      expect(await s.ttsSegment.listAll()).toHaveLength(0);
      expect(await s.asset.listAll()).toHaveLength(0);
    } finally {
      await close();
    }
  });

  it("handles at most 2 items per call and never another user's item", async () => {
    const { db, close } = await makeTestDb();
    try {
      const owner = await signIn(db, "la-c-owner@example.com");
      await addItem(owner, "Owner title");
      const s = await signIn(db, "la-c@example.com");
      await addItem(s, "Mine one");
      await addItem(s, "Mine two");
      await addItem(s, "Mine three");
      const keys = ["Mine one", "Mine two", "Mine three", "Owner title"].map(questionKey);
      const data = expectOk(await ensureLibraryAudioAction(keys));
      expect(Object.keys(data.clips)).toEqual([keys[0], keys[1]]);
      expect(await s.ttsSegment.listAll()).toHaveLength(4);
      const foreign = expectOk(await ensureLibraryAudioAction([questionKey("Owner title")]));
      expect(foreign.clips).toEqual({});
    } finally {
      await close();
    }
  });

  it("rejects a malformed key and an archived item gets no audio", async () => {
    const { db, close } = await makeTestDb();
    try {
      const s = await signIn(db, "la-d@example.com");
      expectFail(await ensureLibraryAudioAction(["not-a-key"]), "invalid");
      const item = await addItem(s, "Archived title");
      await s.libraryItem.update(item.id, { archivedAt: new Date() });
      expect(expectOk(await ensureLibraryAudioAction([questionKey("Archived title")])).clips).toEqual({});
    } finally {
      await close();
    }
  });
});
