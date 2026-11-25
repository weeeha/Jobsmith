import { afterEach, describe, expect, it, vi } from "vitest";
import { makeTestDb, createTestUser } from "../helpers/db";
import { scoped, type Scoped } from "@/lib/db/scoped";
import type { Db } from "@/lib/db/client";
import { createOpportunity } from "@/lib/pipeline/create";
import type { AudioDeps } from "@/lib/audio/deps";
import { generateMissing, planSegments } from "@/lib/audio/segments";
import { sourcesForJob, type AudioContext } from "@/lib/prep/audio-status";
import { markQuestion } from "@/lib/prep/marks";
import { buildPrepManifest } from "@/lib/prep/manifest";
import { createFakeTtsDriver } from "@/lib/tts/fake";
import { createMemoryStorage } from "@/lib/storage/memory";
import { expectOk } from "../helpers/result";

const harness = vi.hoisted(() => ({ db: undefined as Db | undefined, userId: "", signedIn: true }));

vi.mock("@/lib/auth/session", () => ({
  requireUser: async () => {
    if (!harness.signedIn) throw new Error("NEXT_REDIRECT");
    return { id: harness.userId };
  },
}));
vi.mock("@/lib/db/scoped", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/db/scoped")>();
  return { ...actual, scopedFor: (userId: string) => actual.scoped(harness.db!, userId) };
});
vi.mock("@/lib/env", () => ({ env: () => ({ TTS: null }) }));
vi.mock("@/lib/audio/deps", () => ({ audioDeps: () => ({ tts: null }) }));

const FAKE: AudioContext = {
  identity: { provider: "fake", model: "fake-tts" },
  voices: { interviewer: "Vivian", candidate: "Ryan" },
  ttsOn: true,
};
const NOW = new Date("2026-11-21T12:00:00Z");
let counter = 0;
const deps = (): AudioDeps => ({
  tts: createFakeTtsDriver({ sleep: async () => {} }),
  storage: createMemoryStorage(new Map()),
  now: () => NOW,
  randomHex: (bytes) => (++counter).toString(16).padStart(bytes * 2, "0"),
});
const key = (n: number) => n.toString(16).padStart(16, "0");

const closers: (() => Promise<void>)[] = [];
afterEach(async () => {
  harness.signedIn = true;
  while (closers.length) await closers.pop()!();
});

// `shared` puts a second user in the same database, so a slug really can
// collide across users.
async function setup(email: string, shared?: Db, company = "Northwind Traders") {
  let db = shared;
  if (!db) {
    const made = await makeTestDb();
    closers.push(made.close);
    db = made.db;
  }
  const user = await createTestUser(db, email);
  const s = scoped(db, user.id);
  const opp = expectOk(await createOpportunity(s, { companyName: company, roleTitle: "Designer" }));
  return { db, user, s, opportunityId: opp.id, slug: opp.slug };
}

async function addBank(s: Scoped, opportunityId: string, docKey: string, count: number, prefix = "Question") {
  const artifact = await s.artifact.insert({
    opportunityId, companyId: null, stageId: null, key: docKey, version: 1, kind: "question_bank",
    title: `Bank ${docKey}`, bodyMd: "x", contentHash: `h-${docKey}`, sourceHash: `h-${docKey}`, origin: "pushed",
  });
  await s.prepQuestion.replaceForArtifactKey(
    opportunityId,
    docKey,
    Array.from({ length: count }, (_, i) => ({
      opportunityId, artifactId: artifact.id, artifactVersion: 1, artifactKey: docKey, number: i + 1, position: i,
      section: i === 0 ? "Opening" : null,
      question: `${prefix} number ${i + 1}`,
      questionKey: key(i + 1 + (prefix === "Question" ? 0 : 100)),
      blocks: [
        { label: "Say", spoken: true, text: `${prefix} answer ${i + 1}` },
        { label: "Note", spoken: false, text: "Private note" },
      ],
    })),
  );
}

async function generateAll(s: Scoped, opportunityId: string, limit = 100) {
  const sources = await sourcesForJob(s, opportunityId, null);
  const plan = await planSegments(s, { sources, identity: FAKE.identity, voices: FAKE.voices });
  await generateMissing(s, deps(), { needs: plan.missing.slice(0, limit), limit, identity: FAKE.identity, voices: FAKE.voices });
}

describe("buildPrepManifest", () => {
  it("holds questions with blocks and marks, the playback plan per bank and pitch, and the settings", async () => {
    const { s, opportunityId, slug } = await setup("pm-a@example.com");
    await addBank(s, opportunityId, "bank", 2);
    await s.artifact.insert({
      opportunityId, companyId: null, stageId: null, key: "pitch", version: 1, kind: "pitch", title: "Pitch",
      bodyMd: "# T\n\n## Short version\n\nOne sentence.\n", contentHash: "hp", sourceHash: "hp", origin: "pushed",
    });
    expectOk(await markQuestion(s, { opportunityId, scope: "job", questionKey: key(1), level: "shaky", markedAt: NOW, drilled: true }));
    await s.prepMark.listForJob(opportunityId);
    const m = (await buildPrepManifest(s, slug, FAKE, NOW))!;
    expect(m).toMatchObject({ version: 1, slug, generatedAt: NOW.toISOString(), job: { roleTitle: "Designer", companyName: "Northwind Traders" } });
    expect(m.banks).toHaveLength(1);
    const bank = m.banks[0];
    expect(bank).toMatchObject({ key: "bank", kind: "question_bank", stageLabel: null });
    expect(bank.questions.map((q) => q.question)).toEqual(["Question number 1", "Question number 2"]);
    expect(bank.questions[0].blocks).toEqual([
      { label: "Say", spoken: true, text: "Question answer 1" },
      { label: "Note", spoken: false, text: "Private note" },
    ]);
    expect(bank.questions[0]).toMatchObject({ level: "shaky", section: "Opening" });
    expect(bank.questions[0].lastDrilledAt).toBe(NOW.toISOString());
    expect(bank.questions[1]).toMatchObject({ level: null, lastDrilledAt: null });
    expect(bank.plan.steps.map((st) => st.text)).toEqual(["Question number 1", "Question answer 1", "Question number 2", "Question answer 2"]);
    expect(m.pitches.map((p) => [p.key, p.plan.steps.length])).toEqual([["pitch", 2]]);
    expect(m.settings).toEqual({ speed: 1, gapFactor: 1, browserVoices: { interviewer: null, candidate: null } });
  });

  it("lists every distinct clip once with its byte size and sums totalBytes", async () => {
    const { s, opportunityId, slug } = await setup("pm-b@example.com");
    await addBank(s, opportunityId, "bank", 2);
    // A second bank repeating the same questions and answers shares every clip.
    await addBank(s, opportunityId, "bank-two", 2);
    await generateAll(s, opportunityId);
    const m = (await buildPrepManifest(s, slug, FAKE, NOW))!;
    const ids = m.banks.flatMap((b) => b.plan.steps.map((st) => st.clip!.assetId));
    expect(ids).toHaveLength(8);
    expect(m.assets.map((a) => a.id).sort()).toEqual([...new Set(ids)].sort());
    expect(m.assets).toHaveLength(4);
    for (const a of m.assets) expect(a.bytes).toBe((await s.asset.getById(a.id))!.bytes);
    expect(m.totalBytes).toBe(m.assets.reduce((n, a) => n + a.bytes, 0));
    expect(m.totalBytes).toBeGreaterThan(0);
  });

  it("clips that are not done are absent from assets and have clip null in the plan", async () => {
    const { s, opportunityId, slug } = await setup("pm-c@example.com");
    await addBank(s, opportunityId, "bank", 2);
    await generateAll(s, opportunityId, 1);
    const m = (await buildPrepManifest(s, slug, FAKE, NOW))!;
    const steps = m.banks[0].plan.steps;
    expect(steps.filter((st) => st.clip !== null)).toHaveLength(1);
    expect(steps.filter((st) => st.clip === null)).toHaveLength(3);
    expect(m.assets).toHaveLength(1);
    expect(m.assets[0].id).toBe(steps.find((st) => st.clip)!.clip!.assetId);
  });

  it("a slug of another user is null", async () => {
    const mine = await setup("pm-d@example.com");
    const other = await setup("pm-e@example.com", mine.db, "Contoso");
    await addBank(mine.s, mine.opportunityId, "bank", 1);
    expect(await buildPrepManifest(other.s, mine.slug, FAKE, NOW)).toBeNull();
    expect(await buildPrepManifest(mine.s, "no-such-job", FAKE, NOW)).toBeNull();
  });

  it("never holds another job's questions or another user's marks", async () => {
    const mine = await setup("pm-f@example.com");
    const otherJob = expectOk(await createOpportunity(mine.s, { companyName: "Other Co", roleTitle: "Lead" }));
    await addBank(mine.s, mine.opportunityId, "bank", 1);
    await addBank(mine.s, otherJob.id, "bank", 1, "Elsewhere");
    expectOk(await markQuestion(mine.s, { opportunityId: otherJob.id, scope: "job", questionKey: key(101), level: "solid", markedAt: NOW, drilled: false }));
    const other = await setup("pm-g@example.com", mine.db);
    await addBank(other.s, other.opportunityId, "bank", 1);
    expectOk(await markQuestion(other.s, { opportunityId: other.opportunityId, scope: "job", questionKey: key(1), level: "solid", markedAt: NOW, drilled: false }));

    const m = (await buildPrepManifest(mine.s, mine.slug, FAKE, NOW))!;
    const text = JSON.stringify(m);
    expect(text).not.toContain("Elsewhere");
    expect(m.banks[0].questions[0].level).toBeNull();
  });

  it("a job with no banks returns empty banks and zero bytes", async () => {
    const { s, slug } = await setup("pm-h@example.com");
    const m = (await buildPrepManifest(s, slug, FAKE, NOW))!;
    expect(m).toMatchObject({ banks: [], pitches: [], assets: [], totalBytes: 0 });
  });
});

describe("GET /api/prep/[slug]", () => {
  const call = async (slug: string) => {
    const { GET } = await import("@/app/api/prep/[slug]/route");
    return GET(new Request(`https://jobs.test/api/prep/${slug}`), { params: Promise.resolve({ slug }) } as never);
  };

  it("answers 200 JSON with Cache-Control private, no-store, and 404 for an unknown or foreign slug", async () => {
    const mine = await setup("pm-i@example.com");
    const other = await setup("pm-j@example.com", mine.db, "Contoso");
    await addBank(mine.s, mine.opportunityId, "bank", 1);
    harness.db = mine.db;
    harness.userId = mine.user.id;
    const ok = await call(mine.slug);
    expect(ok.status).toBe(200);
    expect(ok.headers.get("cache-control")).toBe("private, no-store");
    expect((await ok.json()).banks).toHaveLength(1);
    expect((await call("no-such-job")).status).toBe(404);
    // The same slug as another user: their own database rows do not include it.
    harness.db = other.db;
    harness.userId = other.user.id;
    const foreign = await call(mine.slug);
    expect(foreign.status).toBe(404);
    expect(foreign.headers.get("cache-control")).toBe("private, no-store");
  });

  it("needs a session", async () => {
    const { db, user, slug } = await setup("pm-k@example.com");
    harness.db = db;
    harness.userId = user.id;
    harness.signedIn = false;
    await expect(call(slug)).rejects.toThrow("NEXT_REDIRECT");
  });
});
