import { describe, expect, it } from "vitest";
import { makeTestDb, createTestUser } from "../helpers/db";
import { scoped, type Scoped } from "@/lib/db/scoped";
import { createOpportunity } from "@/lib/pipeline/create";
import type { AudioDeps } from "@/lib/audio/deps";
import { generateMissing, planSegments } from "@/lib/audio/segments";
import { sourcesForJob, type AudioContext } from "@/lib/prep/audio-status";
import { loadDrillData, summarizeDrill } from "@/lib/prep/drill";
import { markQuestion } from "@/lib/prep/marks";
import { drillGapSeconds } from "@/lib/prep/gaps";
import { savePrepSettings, DEFAULT_PREP_SETTINGS } from "@/lib/prep/settings";
import type { MarkLevel } from "@/lib/prep/values";
import { createFakeTtsDriver } from "@/lib/tts/fake";
import { createMemoryStorage } from "@/lib/storage/memory";
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

type Spec = { n: number; section?: string | null; answer?: boolean; say?: string };

async function addBank(s: Scoped, opportunityId: string, docKey: string, specs: Spec[]) {
  const artifact = await s.artifact.insert({
    opportunityId,
    companyId: null,
    stageId: null,
    key: docKey,
    version: 1,
    kind: "question_bank",
    title: `Bank ${docKey}`,
    bodyMd: "x",
    contentHash: `h-${docKey}`,
    sourceHash: `h-${docKey}`,
    origin: "pushed",
  });
  await s.prepQuestion.replaceForArtifactKey(
    opportunityId,
    docKey,
    specs.map((spec, i) => {
      const answer = spec.answer ?? true;
      return {
        opportunityId,
        artifactId: artifact.id,
        artifactVersion: 1,
        artifactKey: docKey,
        number: spec.n,
        position: i,
        section: spec.section ?? null,
        question: `Question number ${spec.n}`,
        questionKey: key(spec.n),
        hasAnswer: answer,
        spine: `Spine ${spec.n}`,
        lastLine: `Last line ${spec.n}`,
        guard: `Guard ${spec.n}`,
        blocks: [
          { label: "Spine", spoken: false, text: `Spine ${spec.n}` },
          ...(answer ? [{ label: "Say", spoken: true, text: spec.say ?? `Answer number ${spec.n}` }] : []),
          { label: "Guard", spoken: false, text: `Guard ${spec.n}` },
        ],
      };
    }),
  );
}

const input = (opportunityId: string, over: Partial<{ docKey: string | null; section: string | null; count: number | null; onlyShaky: boolean }> = {}) => ({
  opportunityId,
  docKey: null,
  section: null,
  count: null,
  onlyShaky: false,
  audio: FAKE,
  ...over,
});

const mark = (s: Scoped, opportunityId: string, n: number, level: MarkLevel, at = NOW, drilled = false) =>
  markQuestion(s, { scope: "job", opportunityId, questionKey: key(n), level, markedAt: at, drilled });

describe("loadDrillData", () => {
  it("orders questions shaky first and fixes the order in sessionMeta.order", async () => {
    const { s, close, opportunityId } = await setup("dr-a@example.com");
    try {
      await addBank(s, opportunityId, "bank", [{ n: 1 }, { n: 2 }, { n: 3 }, { n: 4 }]);
      expectOk(await mark(s, opportunityId, 3, "shaky"));
      expectOk(await mark(s, opportunityId, 2, "okay"));
      expectOk(await mark(s, opportunityId, 1, "solid"));
      const data = expectOk(await loadDrillData(s, input(opportunityId)));
      expect(data.questions.map((q) => q.questionKey)).toEqual([key(3), key(2), key(4), key(1)]);
      expect(data.sessionMeta).toEqual({ order: [key(3), key(2), key(4), key(1)], docKey: null, section: null, onlyShaky: false });
    } finally {
      await close();
    }
  });

  it("after a question is marked shaky through markQuestion with drilled true, the next loadDrillData starts with it", async () => {
    const { s, close, opportunityId } = await setup("dr-b@example.com");
    try {
      await addBank(s, opportunityId, "bank", [{ n: 1 }, { n: 2 }, { n: 3 }]);
      const first = expectOk(await loadDrillData(s, input(opportunityId)));
      expect(first.questions.map((q) => q.number)).toEqual([1, 2, 3]);
      // One run: 1 solid, 2 shaky, 3 okay, all drilled.
      expectOk(await mark(s, opportunityId, 1, "solid", NOW, true));
      expectOk(await mark(s, opportunityId, 2, "shaky", NOW, true));
      expectOk(await mark(s, opportunityId, 3, "okay", NOW, true));
      const second = expectOk(await loadDrillData(s, input(opportunityId)));
      expect(second.questions.map((q) => q.number)).toEqual([2, 3, 1]);
    } finally {
      await close();
    }
  });

  it("a question marked solid comes last", async () => {
    const { s, close, opportunityId } = await setup("dr-c@example.com");
    try {
      await addBank(s, opportunityId, "bank", [{ n: 1 }, { n: 2 }, { n: 3 }]);
      expectOk(await mark(s, opportunityId, 1, "solid"));
      const data = expectOk(await loadDrillData(s, input(opportunityId)));
      expect(data.questions.at(-1)?.number).toBe(1);
    } finally {
      await close();
    }
  });

  it("docKey limits the session to one bank; no docKey uses every bank of the job", async () => {
    const { s, close, opportunityId } = await setup("dr-d@example.com");
    try {
      await addBank(s, opportunityId, "bank-a", [{ n: 1 }, { n: 2 }]);
      await addBank(s, opportunityId, "bank-b", [{ n: 3 }]);
      const one = expectOk(await loadDrillData(s, input(opportunityId, { docKey: "bank-b" })));
      expect(one.questions.map((q) => q.number)).toEqual([3]);
      expect(one.sessionMeta.docKey).toBe("bank-b");
      const all = expectOk(await loadDrillData(s, input(opportunityId)));
      expect(all.questions.map((q) => q.number).sort()).toEqual([1, 2, 3]);
    } finally {
      await close();
    }
  });

  it("count limits a drill and a section ignores it", async () => {
    const { s, close, opportunityId } = await setup("dr-e@example.com");
    try {
      const specs: Spec[] = Array.from({ length: 14 }, (_, i) => ({ n: i + 1, section: i < 12 ? "Opening" : "Craft" }));
      await addBank(s, opportunityId, "bank", specs);
      expect(expectOk(await loadDrillData(s, input(opportunityId))).questions).toHaveLength(10);
      expect(expectOk(await loadDrillData(s, input(opportunityId, { count: 3 }))).questions).toHaveLength(3);
      const section = expectOk(await loadDrillData(s, input(opportunityId, { section: "Opening", count: 3 })));
      expect(section.questions).toHaveLength(12);
      expect(section.sessionMeta.section).toBe("Opening");
    } finally {
      await close();
    }
  });

  it("onlyShaky returns just the shaky questions and empty when there are none", async () => {
    const { s, close, opportunityId } = await setup("dr-f@example.com");
    try {
      await addBank(s, opportunityId, "bank", [{ n: 1 }, { n: 2 }, { n: 3 }]);
      expectFail(await loadDrillData(s, input(opportunityId, { onlyShaky: true })), "empty");
      expectOk(await mark(s, opportunityId, 2, "shaky"));
      expectOk(await mark(s, opportunityId, 3, "okay"));
      const data = expectOk(await loadDrillData(s, input(opportunityId, { onlyShaky: true })));
      expect(data.questions.map((q) => q.number)).toEqual([2]);
      expect(data.sessionMeta.onlyShaky).toBe(true);
    } finally {
      await close();
    }
  });

  it("a job with no answered question is empty", async () => {
    const { s, close, opportunityId } = await setup("dr-g@example.com");
    try {
      expectFail(await loadDrillData(s, input(opportunityId)), "empty");
      await addBank(s, opportunityId, "bank", [{ n: 1, answer: false }, { n: 2, answer: false }]);
      expectFail(await loadDrillData(s, input(opportunityId)), "empty");
    } finally {
      await close();
    }
  });

  it("each question carries ask and say steps with clips attached when segments are done and browser steps otherwise", async () => {
    const { s, close, opportunityId } = await setup("dr-h@example.com");
    try {
      await addBank(s, opportunityId, "bank", [{ n: 1 }, { n: 2 }]);
      const sources = await sourcesForJob(s, opportunityId, "bank");
      const plan = await planSegments(s, { sources, identity: FAKE.identity, voices: FAKE.voices });
      // Generate only question 1's two clips.
      const mine = plan.missing.filter((m) => m.text.endsWith("number 1"));
      expect(mine).toHaveLength(2);
      await generateMissing(s, deps(), { needs: mine, limit: 2, identity: FAKE.identity, voices: FAKE.voices });

      const data = expectOk(await loadDrillData(s, input(opportunityId)));
      const [q1, q2] = data.questions;
      expect(q1.ask).toMatchObject({ speaker: "interviewer", kind: "question", text: "Question number 1" });
      expect(q1.ask.clip).not.toBeNull();
      expect(q1.say).toHaveLength(1);
      expect(q1.say[0]).toMatchObject({ speaker: "candidate", kind: "text", text: "Answer number 1" });
      expect(q1.say[0].clip).not.toBeNull();
      expect(q2.ask.clip).toBeNull();
      expect(q2.say[0].clip).toBeNull();
      expect(q2.ask.hash).toMatch(/^[0-9a-f]{16}$/);
      expect(q1).toMatchObject({ spine: "Spine 1", lastLine: "Last line 1", guard: "Guard 1", sayText: "Answer number 1", number: 1, question: "Question number 1" });
    } finally {
      await close();
    }
  });

  it("gapSeconds uses the Say length and the saved gap factor", async () => {
    const { s, close, opportunityId } = await setup("dr-i@example.com");
    try {
      const long = "word ".repeat(400).trim();
      await addBank(s, opportunityId, "bank", [{ n: 1, say: long }, { n: 2 }]);
      const base = expectOk(await loadDrillData(s, input(opportunityId)));
      const byNumber = (d: typeof base, n: number) => d.questions.find((q) => q.number === n)!;
      expect(byNumber(base, 1).gapSeconds).toBe(drillGapSeconds(long.length, 1));
      expect(byNumber(base, 2).gapSeconds).toBe(15);
      await savePrepSettings(s, { voices: { interviewer: null, candidate: null }, speed: 1, gapFactor: 2, browserVoices: { interviewer: null, candidate: null } });
      const doubled = expectOk(await loadDrillData(s, input(opportunityId)));
      expect(doubled.settings.gapFactor).toBe(2);
      expect(byNumber(doubled, 1).gapSeconds).toBe(drillGapSeconds(long.length, 2));
      expect(byNumber(doubled, 2).gapSeconds).toBe(30);
      expect(DEFAULT_PREP_SETTINGS.gapFactor).toBe(1);
    } finally {
      await close();
    }
  });

  it("another user's job is not_found", async () => {
    const mine = await setup("dr-j@example.com");
    const other = await setup("dr-k@example.com");
    try {
      await addBank(mine.s, mine.opportunityId, "bank", [{ n: 1 }]);
      expectFail(await loadDrillData(other.s, input(mine.opportunityId)), "not_found");
    } finally {
      await mine.close();
      await other.close();
    }
  });
});

describe("summarizeDrill", () => {
  const questions = [
    { questionKey: "a", question: "Question A", level: null },
    { questionKey: "b", question: "Question B", level: "shaky" as const },
    { questionKey: "c", question: "Question C", level: "okay" as const },
    { questionKey: "d", question: "Question D", level: null },
  ];

  it("lists marks given, counts solid and skipped and returns the questions still shaky", () => {
    const summary = summarizeDrill(questions, { a: "solid", c: "shaky", d: "okay" }, ["b"]);
    expect(summary.marks).toEqual([
      { questionKey: "a", question: "Question A", level: "solid" },
      { questionKey: "c", question: "Question C", level: "shaky" },
      { questionKey: "d", question: "Question D", level: "okay" },
    ]);
    expect(summary.solid).toBe(1);
    expect(summary.skipped).toBe(1);
    expect(summary.stillShaky.map((q) => q.questionKey)).toEqual(["b", "c"]);
  });

  it("a skipped question that was already shaky stays in stillShaky", () => {
    const summary = summarizeDrill(questions, {}, ["b"]);
    expect(summary.stillShaky).toEqual([{ questionKey: "b", question: "Question B" }]);
    expect(summary.marks).toEqual([]);
  });

  it("a shaky question marked solid now is no longer still shaky", () => {
    const summary = summarizeDrill(questions, { b: "solid" }, []);
    expect(summary.stillShaky).toEqual([]);
    expect(summary.solid).toBe(1);
  });
});
