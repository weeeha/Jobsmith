import { describe, expect, it } from "vitest";
import { makeTestDb, createTestUser } from "../helpers/db";
import { scoped, type Scoped } from "@/lib/db/scoped";
import { createOpportunity } from "@/lib/pipeline/create";
import type { AudioDeps } from "@/lib/audio/deps";
import { generateMissing, planSegments, referencedHashes } from "@/lib/audio/segments";
import { createLibraryItem, archiveLibraryItem } from "@/lib/library/items";
import { loadLibraryDrillData } from "@/lib/library/drill";
import type { AudioContext } from "@/lib/prep/audio-status";
import { drillGapSeconds } from "@/lib/prep/gaps";
import { markQuestion } from "@/lib/prep/marks";
import { questionKey } from "@/lib/prep/question-key";
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

async function setup(email: string) {
  const { db, close } = await makeTestDb();
  const user = await createTestUser(db, email);
  return { s: scoped(db, user.id), close };
}

const input = (over: Partial<{ count: number | null; onlyShaky: boolean }> = {}) => ({ count: null, audio: FAKE, ...over });

async function addItem(s: Scoped, title: string, body: string, withKey = true) {
  return expectOk(
    await createLibraryItem(s, { kind: "answer", title, bodyMd: body, tags: [] }, withKey ? { questionKey: questionKey(title) } : {}),
  );
}

const mark = (s: Scoped, title: string, level: MarkLevel, at = NOW, drilled = false) =>
  markQuestion(s, { scope: "library", opportunityId: null, questionKey: questionKey(title), level, markedAt: at, drilled });

describe("loadLibraryDrillData", () => {
  it("orders by library-scope level and last drilled and skips items with no question key", async () => {
    const { s, close } = await setup("ld-a@example.com");
    try {
      await addItem(s, "Alpha question", "Alpha body");
      await addItem(s, "Beta question", "Beta body");
      await addItem(s, "Gamma question", "Gamma body");
      await addItem(s, "A story", "No key here", false);
      expectOk(await mark(s, "Gamma question", "shaky"));
      expectOk(await mark(s, "Alpha question", "solid"));
      const data = expectOk(await loadLibraryDrillData(s, input()));
      expect(data.questions.map((q) => q.question)).toEqual(["Gamma question", "Beta question", "Alpha question"]);
      expect(data.sessionMeta.order).toEqual(data.questions.map((q) => q.questionKey));
      expect(data.sessionMeta).toMatchObject({ docKey: null, section: null, onlyShaky: false });
    } finally {
      await close();
    }
  });

  it("each question's ask is the item title and say is the item body's spoken text", async () => {
    const { s, close } = await setup("ld-b@example.com");
    try {
      await addItem(s, "Tell me about yourself", "I make **boxes**.\n\n- Calm\n- Fast");
      const q = expectOk(await loadLibraryDrillData(s, input())).questions[0];
      expect(q.ask).toMatchObject({ speaker: "interviewer", kind: "question", text: "Tell me about yourself" });
      expect(q.say).toHaveLength(1);
      expect(q.say[0]).toMatchObject({ speaker: "candidate", kind: "text", text: "I make boxes. Calm. Fast." });
      expect(q.sayText).toBe("I make **boxes**.\n\n- Calm\n- Fast");
      expect(q.gapSeconds).toBe(drillGapSeconds("I make boxes. Calm. Fast.".length, 1));
    } finally {
      await close();
    }
  });

  it("a library mark made in a drill puts that item first next time when it was marked shaky", async () => {
    const { s, close } = await setup("ld-c@example.com");
    try {
      await addItem(s, "One question", "One body");
      await addItem(s, "Two question", "Two body");
      await addItem(s, "Three question", "Three body");
      expectOk(await mark(s, "One question", "solid", NOW, true));
      expectOk(await mark(s, "Two question", "shaky", NOW, true));
      expectOk(await mark(s, "Three question", "okay", NOW, true));
      const data = expectOk(await loadLibraryDrillData(s, input()));
      expect(data.questions.map((q) => q.question)).toEqual(["Two question", "Three question", "One question"]);
      const shaky = expectOk(await loadLibraryDrillData(s, input({ onlyShaky: true })));
      expect(shaky.questions.map((q) => q.question)).toEqual(["Two question"]);
    } finally {
      await close();
    }
  });

  it("a question with a matching row shows that row's Spine; otherwise there is none", async () => {
    const { s, close } = await setup("ld-d@example.com");
    try {
      const opportunityId = expectOk(await createOpportunity(s, { companyName: "Northwind", roleTitle: "Designer" })).id;
      const artifact = await s.artifact.insert({
        opportunityId,
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
      await s.prepQuestion.replaceForArtifactKey(opportunityId, "bank", [
        {
          opportunityId,
          artifactId: artifact.id,
          artifactVersion: 1,
          artifactKey: "bank",
          number: 1,
          position: 0,
          question: "With a row",
          questionKey: questionKey("With a row"),
          hasAnswer: true,
          spine: "Row spine",
          blocks: [{ label: "Say", spoken: true, text: "x" }],
        },
      ]);
      await addItem(s, "With a row", "Item body");
      await addItem(s, "Without a row", "Other body");
      const data = expectOk(await loadLibraryDrillData(s, input()));
      const byTitle = (t: string) => data.questions.find((q) => q.question === t)!;
      expect(byTitle("With a row").spine).toBe("Row spine");
      expect(byTitle("Without a row").spine).toBeNull();
      expect(byTitle("Without a row").sayText).toBe("Other body");
    } finally {
      await close();
    }
  });

  it("leaves out archived items, and an empty library is empty", async () => {
    const { s, close } = await setup("ld-e@example.com");
    try {
      expectFail(await loadLibraryDrillData(s, input()), "empty");
      const item = await addItem(s, "Only one", "Body");
      expectOk(await archiveLibraryItem(s, item.id, true));
      expectFail(await loadLibraryDrillData(s, input()), "empty");
      await addItem(s, "A story", "Body", false);
      expectFail(await loadLibraryDrillData(s, input()), "empty");
    } finally {
      await close();
    }
  });

  it("count limits the drill", async () => {
    const { s, close } = await setup("ld-f@example.com");
    try {
      for (let i = 1; i <= 4; i += 1) await addItem(s, `Question ${i} here`, `Body ${i}`);
      expect(expectOk(await loadLibraryDrillData(s, input({ count: 2 }))).questions).toHaveLength(2);
    } finally {
      await close();
    }
  });

  it("clip hashes match the ones the audio cleanup counts as referenced, so clips are shared", async () => {
    const { s, close } = await setup("ld-g@example.com");
    try {
      await addItem(s, "Shared question", "Shared body text");
      const referenced = await referencedHashes(s, FAKE.identity, FAKE.voices);
      const q = expectOk(await loadLibraryDrillData(s, input())).questions[0];
      expect(referenced.has(q.ask.hash)).toBe(true);
      expect(referenced.has(q.say[0].hash)).toBe(true);
      expect(q.ask.clip).toBeNull();
      // Generate through the same planner and the clips attach.
      const sources = [
        { question: "Shared question", section: null, number: 1, questionKey: questionKey("Shared question"), blocks: [{ label: "Say", spoken: true, text: "Shared body text" }] },
      ];
      const plan = await planSegments(s, { sources, identity: FAKE.identity, voices: FAKE.voices });
      await generateMissing(s, deps(), { needs: plan.missing, limit: 5, identity: FAKE.identity, voices: FAKE.voices });
      const again = expectOk(await loadLibraryDrillData(s, input())).questions[0];
      expect(again.ask.clip).not.toBeNull();
      expect(again.say[0].clip).not.toBeNull();
    } finally {
      await close();
    }
  });

  it("never reads another user's items", async () => {
    const mine = await setup("ld-h@example.com");
    const other = await setup("ld-i@example.com");
    try {
      await addItem(other.s, "Theirs", "Body");
      expectFail(await loadLibraryDrillData(mine.s, input()), "empty");
    } finally {
      await mine.close();
      await other.close();
    }
  });
});
