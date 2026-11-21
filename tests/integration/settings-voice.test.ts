import { afterEach, describe, expect, it, vi } from "vitest";
import type { Db } from "@/lib/db/client";
import { scoped, type Scoped } from "@/lib/db/scoped";
import { deleteAllAudioAction, loadVoicesAction, savePrepSettingsAction } from "@/app/(app)/settings/actions";
import type { AudioDeps } from "@/lib/audio/deps";
import { generateMissing } from "@/lib/audio/segments";
import { getPrepSettings } from "@/lib/prep/settings";
import { loadVoiceOptions } from "@/lib/prep/voices";
import { createFakeTtsDriver } from "@/lib/tts/fake";
import { createMemoryStorage } from "@/lib/storage/memory";
import type { TtsDriver } from "@/lib/tts/driver";
import { makeTestDb, createTestUser } from "../helpers/db";
import { expectFail, expectOk } from "../helpers/result";

const harness = vi.hoisted(() => ({
  db: undefined as Db | undefined,
  userId: "",
  deps: undefined as AudioDeps | undefined,
}));

vi.mock("@/lib/auth/session", () => ({ requireUser: async () => ({ id: harness.userId }) }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/db/scoped", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/db/scoped")>();
  return { ...actual, scopedFor: (userId: string) => actual.scoped(harness.db!, userId) };
});
vi.mock("@/lib/audio/deps", () => ({ audioDeps: () => harness.deps }));

afterEach(() => vi.restoreAllMocks());

let counter = 0;
function makeDeps(tts: TtsDriver | null = createFakeTtsDriver({ sleep: async () => {} }), objects = new Map<string, Uint8Array>()): AudioDeps {
  return {
    tts,
    storage: createMemoryStorage(objects),
    now: () => new Date("2026-11-21T12:00:00Z"),
    randomHex: (bytes) => (++counter).toString(16).padStart(bytes * 2, "0"),
  };
}

async function signIn(db: Db, email: string, deps = makeDeps()): Promise<Scoped> {
  harness.db = db;
  const user = await createTestUser(db, email);
  harness.userId = user.id;
  harness.deps = deps;
  return scoped(db, user.id);
}

function form(values: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) data.set(key, value);
  return data;
}

const VALID = {
  interviewerVoice: "Aria",
  candidateVoice: " Ryan ",
  speed: "1.3",
  gapFactor: "1.5",
  browserInterviewer: "Daniel",
  browserCandidate: "",
};

describe("savePrepSettingsAction", () => {
  it("saves voices, speed, gap factor and browser voices", async () => {
    const { db, close } = await makeTestDb();
    try {
      const s = await signIn(db, "sv-a@example.com");
      expect(await savePrepSettingsAction(undefined, form(VALID))).toEqual({ ok: true });
      expect(await getPrepSettings(s)).toEqual({
        version: 1,
        voices: { interviewer: "Aria", candidate: "Ryan" },
        speed: 1.3,
        gapFactor: 1.5,
        browserVoices: { interviewer: "Daniel", candidate: null },
      });
    } finally {
      await close();
    }
  });

  it("returns field errors for an out-of-range speed and saves nothing", async () => {
    const { db, close } = await makeTestDb();
    try {
      const s = await signIn(db, "sv-b@example.com");
      const state = await savePrepSettingsAction(undefined, form({ ...VALID, speed: "3", gapFactor: "9" }));
      expect(state).toMatchObject({ ok: false, code: "invalid" });
      if (state?.ok === false) {
        expect(state.fieldErrors?.speed).toBe("Enter a speed from 0.8 to 1.5.");
        expect(state.fieldErrors?.gapFactor).toBe("Enter a pause factor from 0.5 to 2.");
      }
      expect((await getPrepSettings(s)).speed).toBe(1);
    } finally {
      await close();
    }
  });

  it("a blank or unreadable speed is a field error", async () => {
    const { db, close } = await makeTestDb();
    try {
      await signIn(db, "sv-b2@example.com");
      const blank = await savePrepSettingsAction(undefined, form({ ...VALID, speed: "" }));
      expect(blank).toMatchObject({ ok: false, fieldErrors: { speed: "Enter a speed from 0.8 to 1.5." } });
      const garbage = await savePrepSettingsAction(undefined, form({ ...VALID, speed: "unreadable" }));
      expect(garbage).toMatchObject({ ok: false, fieldErrors: { speed: "Enter a speed from 0.8 to 1.5." } });
    } finally {
      await close();
    }
  });
});

describe("deleteAllAudioAction", () => {
  it("removes every segment, asset and object of the caller and no one else's", async () => {
    const { db, close } = await makeTestDb();
    try {
      const objects = new Map<string, Uint8Array>();
      const deps = makeDeps(undefined, objects);
      const s = await signIn(db, "sv-c@example.com", deps);
      const identity = { provider: "fake", model: "fake-tts" };
      const voices = { interviewer: "Vivian", candidate: "Ryan" };
      const needs = [
        { hash: "aaaaaaaaaaaaaaaa", speaker: "interviewer" as const, text: "One line." },
        { hash: "bbbbbbbbbbbbbbbb", speaker: "candidate" as const, text: "Another line." },
      ];
      await generateMissing(s, deps, { needs, limit: 10, identity, voices });
      expect((await s.asset.totals()).clips).toBe(2);
      expect(objects.size).toBe(2);

      const other = await createTestUser(db, "sv-c-other@example.com");
      const so = scoped(db, other.id);
      await generateMissing(so, deps, { needs: [needs[0]], limit: 10, identity, voices });
      const otherObjects = objects.size - 2;
      expect(otherObjects).toBe(1);

      const result = expectOk(await deleteAllAudioAction());
      expect(result.deleted).toBe(2);
      expect((await s.asset.totals()).clips).toBe(0);
      expect(await s.ttsSegment.listAll()).toHaveLength(0);
      expect(objects.size).toBe(1);
      expect((await so.asset.totals()).clips).toBe(1);
    } finally {
      await close();
    }
  });
});

describe("loadVoiceOptions", () => {
  it("returns the provider's list", async () => {
    expect((await loadVoiceOptions(createFakeTtsDriver())).map((v) => v.id)).toEqual(["Vivian", "Ryan", "Aria"]);
  });

  it("returns [] for no driver, when the driver throws, and when it times out", async () => {
    expect(await loadVoiceOptions(null)).toEqual([]);
    const throwing = { ...createFakeTtsDriver(), voices: async () => Promise.reject(new Error("down")) };
    expect(await loadVoiceOptions(throwing)).toEqual([]);
    const hanging = { ...createFakeTtsDriver(), voices: () => new Promise<never>(() => {}) };
    const started = Date.now();
    expect(await loadVoiceOptions(hanging, 30)).toEqual([]);
    expect(Date.now() - started).toBeLessThan(1000);
  });
});

describe("loadVoicesAction", () => {
  it("returns the provider's voices on demand and tts_off without a driver", async () => {
    const { db, close } = await makeTestDb();
    try {
      await signIn(db, "sv-d@example.com");
      expect(expectOk(await loadVoicesAction()).map((v) => v.id)).toEqual(["Vivian", "Ryan", "Aria"]);
      harness.deps = makeDeps(null);
      expectFail(await loadVoicesAction(), "tts_off");
    } finally {
      await close();
    }
  });
});
