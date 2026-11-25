import { describe, expect, it } from "vitest";
import { makeTestDb, createTestUser } from "../helpers/db";
import { scoped, type Scoped } from "@/lib/db/scoped";
import { createOpportunity } from "@/lib/pipeline/create";
import type { AudioDeps } from "@/lib/audio/deps";
import { generateMissing, planSegments } from "@/lib/audio/segments";
import { sourcesForJob, type AudioContext } from "@/lib/prep/audio-status";
import { markQuestion } from "@/lib/prep/marks";
import { loadPlayerData } from "@/lib/prep/player-data";
import { createFakeTtsDriver } from "@/lib/tts/fake";
import { createMemoryStorage } from "@/lib/storage/memory";
import { CLI_TTS_IDENTITY } from "@/lib/tts/config";
import { expectFail, expectOk } from "../helpers/result";

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

async function setup(email: string) {
  const { db, close } = await makeTestDb();
  const user = await createTestUser(db, email);
  const s = scoped(db, user.id);
  const opportunityId = expectOk(await createOpportunity(s, { companyName: "Northwind Traders", roleTitle: "Designer" })).id;
  return { s, close, opportunityId };
}

async function addBank(s: Scoped, opportunityId: string, docKey: string, count: number) {
  const artifact = await s.artifact.insert({
    opportunityId,
    companyId: null,
    stageId: null,
    key: docKey,
    version: 1,
    kind: "question_bank",
    title: "Question bank",
    bodyMd: "x",
    contentHash: `h-${docKey}`,
    sourceHash: `h-${docKey}`,
    origin: "pushed",
  });
  await s.prepQuestion.replaceForArtifactKey(
    opportunityId,
    docKey,
    Array.from({ length: count }, (_, i) => ({
      opportunityId,
      artifactId: artifact.id,
      artifactVersion: 1,
      artifactKey: docKey,
      number: i + 1,
      position: i,
      section: i === 0 ? "Opening" : null,
      question: `Question number ${i + 1}`,
      questionKey: key(i + 1),
      blocks: [
        { label: "Say", spoken: true, text: `Answer number ${i + 1}` },
        { label: "Note", spoken: false, text: "Private note" },
      ],
    })),
  );
}

async function addPitch(s: Scoped, opportunityId: string) {
  await s.artifact.insert({
    opportunityId,
    companyId: null,
    stageId: null,
    key: "pitch",
    version: 1,
    kind: "pitch",
    title: "Portfolio walkthrough pitch",
    bodyMd: "# Title\n\nIgnored lead.\n\n## Short version\n\nOne sentence framing.\n\n## Long version\n\nThe long story.\n",
    contentHash: "hp",
    sourceHash: "hp",
    origin: "pushed",
  });
}

const load = (s: Scoped, opportunityId: string, docKey: string, audio: AudioContext = FAKE) =>
  loadPlayerData(s, { opportunityId, docKey, scope: "opportunity", audio });

describe("loadPlayerData", () => {
  it("builds a plan for a bank: steps in source order with the saved clips attached and browser steps for the rest", async () => {
    const { s, close, opportunityId } = await setup("pd-a@example.com");
    try {
      await addBank(s, opportunityId, "bank", 3);
      const sources = await sourcesForJob(s, opportunityId, "bank");
      const before = await planSegments(s, { sources, identity: FAKE.identity, voices: FAKE.voices });
      await generateMissing(s, deps(), { needs: before.missing.slice(0, 2), limit: 2, identity: FAKE.identity, voices: FAKE.voices });

      const data = expectOk(await load(s, opportunityId, "bank"));
      expect(data.kind).toBe("bank");
      expect(data.plan.title).toBe("Question bank");
      expect(data.plan.subtitle).toContain("Northwind Traders");
      expect(data.plan.steps.map((st) => st.text)).toEqual([
        "Question number 1",
        "Answer number 1",
        "Question number 2",
        "Answer number 2",
        "Question number 3",
        "Answer number 3",
      ]);
      expect(data.plan.steps.map((st) => st.clip !== null)).toEqual([true, true, false, false, false, false]);
      expect(data.plan.steps.every((st) => /^[0-9a-f]{16}$/.test(st.hash))).toBe(true);
      expect(data.plan.questions[0]).toMatchObject({ number: 1, section: "Opening", questionKey: key(1) });
      expect(data.plan.questions[0].blocks.map((b) => b.spoken)).toEqual([true, false]);
      expect(data.settings.speed).toBe(1);
    } finally {
      await close();
    }
  });

  it("a pending or failed segment, or no segment, gives clip null for that step", async () => {
    const { s, close, opportunityId } = await setup("pd-b@example.com");
    try {
      await addBank(s, opportunityId, "bank", 1);
      const first = expectOk(await load(s, opportunityId, "bank"));
      const [question, answer] = first.plan.steps;
      for (const [step, status] of [[question, "pending"], [answer, "failed"]] as const) {
        await s.ttsSegment.insert({
          hash: step.hash,
          provider: "fake",
          model: "fake-tts",
          voice: "x",
          style: "v1",
          textChars: step.text.length,
          status,
          assetId: null,
          suspect: false,
          attempts: 1,
          errorCode: null,
        });
      }
      const data = expectOk(await load(s, opportunityId, "bank"));
      expect(data.plan.steps.map((st) => st.clip)).toEqual([null, null]);
    } finally {
      await close();
    }
  });

  it("a suspect clip carries suspect true", async () => {
    const { s, close, opportunityId } = await setup("pd-c@example.com");
    try {
      await addBank(s, opportunityId, "bank", 1);
      const sources = await sourcesForJob(s, opportunityId, "bank");
      const plan = await planSegments(s, { sources, identity: FAKE.identity, voices: FAKE.voices });
      await generateMissing(s, deps(), { needs: plan.missing, limit: 10, identity: FAKE.identity, voices: FAKE.voices });
      const clean = expectOk(await load(s, opportunityId, "bank"));
      expect(clean.plan.steps.map((st) => st.clip?.suspect)).toEqual([false, false]);
      const rows = await s.ttsSegment.listByHashes([clean.plan.steps[1].hash]);
      await s.ttsSegment.update(rows[0].id, { suspect: true });
      const data = expectOk(await load(s, opportunityId, "bank"));
      expect(data.plan.steps.map((st) => st.clip?.suspect)).toEqual([false, true]);
    } finally {
      await close();
    }
  });

  it("a pitch artifact gives chapters as the questions and candidate-only steps", async () => {
    const { s, close, opportunityId } = await setup("pd-d@example.com");
    try {
      await addPitch(s, opportunityId);
      const data = expectOk(await load(s, opportunityId, "pitch"));
      expect(data.kind).toBe("pitch");
      expect(data.plan.title).toBe("Portfolio walkthrough pitch");
      expect(data.plan.questions.map((q) => q.question)).toEqual(["Short version", "Long version"]);
      expect(data.plan.steps.every((st) => st.speaker === "candidate")).toBe(true);
      expect(data.plan.steps.map((st) => st.text)).toEqual(["Short version", "One sentence framing.", "Long version", "The long story."]);
      expect(data.plan.questions.every((q) => q.level === null)).toBe(true);
    } finally {
      await close();
    }
  });

  it("an unknown document key is not_found and another user's job is not_found", async () => {
    const mine = await setup("pd-e@example.com");
    const other = await setup("pd-f@example.com");
    try {
      await addBank(mine.s, mine.opportunityId, "bank", 1);
      expectFail(await load(mine.s, mine.opportunityId, "nope"), "not_found");
      expectFail(await load(other.s, mine.opportunityId, "bank"), "not_found");
    } finally {
      await mine.close();
      await other.close();
    }
  });

  it("with TTS off it still attaches done clips whose hash matches CLI_TTS_IDENTITY", async () => {
    const { s, close, opportunityId } = await setup("pd-g@example.com");
    try {
      await addBank(s, opportunityId, "bank", 1);
      const cli = { identity: { ...CLI_TTS_IDENTITY }, voices: FAKE.voices, ttsOn: false };
      const sources = await sourcesForJob(s, opportunityId, "bank");
      const plan = await planSegments(s, { sources, identity: cli.identity, voices: cli.voices });
      await generateMissing(s, deps(), { needs: plan.missing, limit: 10, identity: cli.identity, voices: cli.voices });
      const off = expectOk(await load(s, opportunityId, "bank", cli));
      expect(off.plan.steps.every((st) => st.clip !== null)).toBe(true);
      // A different identity does not see them.
      const other = expectOk(await load(s, opportunityId, "bank", FAKE));
      expect(other.plan.steps.every((st) => st.clip === null)).toBe(true);
    } finally {
      await close();
    }
  });

  it("the plan holds each question's current mark level from the job's marks", async () => {
    const { s, close, opportunityId } = await setup("pd-h@example.com");
    try {
      await addBank(s, opportunityId, "bank", 2);
      expectOk(await markQuestion(s, { scope: "job", opportunityId, questionKey: key(2), level: "shaky", markedAt: NOW, drilled: false }));
      const data = expectOk(await load(s, opportunityId, "bank"));
      expect(data.plan.questions.map((q) => q.level)).toEqual([null, "shaky"]);
    } finally {
      await close();
    }
  });
});
