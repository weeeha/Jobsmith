import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { makeTestDb, createTestUser } from "../helpers/db";
import { scoped, type Scoped } from "@/lib/db/scoped";
import { createOpportunity } from "@/lib/pipeline/create";
import { upsertArtifacts, type IncomingArtifact } from "@/lib/artifacts/upsert";
import { loadPrepHub } from "@/lib/prep/hub";
import { expectOk } from "../helpers/result";

const FIXTURES = path.resolve(__dirname, "../fixtures");
const read = (p: string) => readFileSync(path.join(FIXTURES, p), "utf8");
const NWT_BANK = read("prep/nwt-answers-full.md");
const PACKET_ANSWERS = read("packet/nwl-answers-full.md");
const PACKET_CALL_CARD = read("packet/nwl-call-card.md");
const SMALL_BANK = `## Opening\n\n### 1. "Tell me about yourself"\n\n**Spine:** Craft, range, why us.\n\n**Say:** I design ordering tools.\n\n### 2. "Why us?"\n\n**Say:** You sell to shops.\n`;

async function setup(email: string) {
  const { db, close } = await makeTestDb();
  const user = await createTestUser(db, email);
  const s = scoped(db, user.id);
  const opportunityId = expectOk(await createOpportunity(s, { companyName: "Northwind Traders", roleTitle: "Designer" })).id;
  return { s, close, opportunityId };
}

const doc = (key: string, kind: IncomingArtifact["kind"], bodyMd: string, over: Partial<IncomingArtifact> = {}): IncomingArtifact => ({
  key,
  kind,
  title: key,
  scope: "opportunity",
  stage: null,
  bodyMd,
  ...over,
});

const push = async (s: Scoped, opportunityId: string, inputs: IncomingArtifact[]) =>
  expectOk(await upsertArtifacts(s, opportunityId, inputs, { origin: "pushed", now: new Date("2026-04-01T00:00:00Z") }));

async function hub(s: Scoped, opportunityId: string) {
  const docs = await s.artifact.listLatestForOpportunity(opportunityId);
  const stages = await s.stage.listForOpportunity(opportunityId);
  return loadPrepHub(s, { opportunityId, docs, stages });
}

// Inserted without a rebuild, as a document that predates Prep.
async function insertDoc(s: Scoped, opportunityId: string, key: string, kind: "question_bank" | "call_card", bodyMd: string) {
  await s.artifact.insert({
    opportunityId,
    companyId: null,
    stageId: null,
    key,
    version: 1,
    kind,
    title: key,
    bodyMd,
    contentHash: `h-${key}`,
    sourceHash: `h-${key}`,
    origin: "pushed",
  });
}

describe("loadPrepHub", () => {
  it("one card per question_bank, grouped by stage with a General group for unstaged ones", async () => {
    const { s, close, opportunityId } = await setup("hub1@example.com");
    try {
      const stages = await s.stage.listForOpportunity(opportunityId);
      const stage = stages[1];
      await push(s, opportunityId, [
        doc("general-bank", "question_bank", SMALL_BANK),
        doc("staged-bank", "question_bank", SMALL_BANK, { stage: { ref: stage.label } }),
      ]);
      const view = await hub(s, opportunityId);
      expect(view.banks.map((b) => b.key).sort()).toEqual(["general-bank", "staged-bank"]);
      expect(view.groups.map((g) => g.heading)).toEqual(["General", stage.label]);
      expect(view.groups[0].stageId).toBeNull();
      expect(view.groups[0].banks.map((b) => b.key)).toEqual(["general-bank"]);
      expect(view.groups[1]).toMatchObject({ stageId: stage.id });
      const staged = view.banks.find((b) => b.key === "staged-bank")!;
      expect(staged).toMatchObject({ stageId: stage.id, stageLabel: stage.label, kind: "question_bank", version: 1, title: "staged-bank" });
    } finally {
      await close();
    }
  });

  it("a card carries the question count and the confidence summary from the job's marks", async () => {
    const { s, close, opportunityId } = await setup("hub2@example.com");
    try {
      await push(s, opportunityId, [doc("bank", "question_bank", NWT_BANK)]);
      const rows = await s.prepQuestion.listForJob(opportunityId);
      await s.prepMark.applyMark({ scope: "job", opportunityId, questionKey: rows[0].questionKey, level: "solid", markedAt: new Date("2026-04-01T01:00:00Z"), drilled: false });
      await s.prepMark.applyMark({ scope: "job", opportunityId, questionKey: rows[1].questionKey, level: "shaky", markedAt: new Date("2026-04-01T01:00:00Z"), drilled: false });
      const [card] = (await hub(s, opportunityId)).banks;
      expect(card.questionCount).toBe(7);
      expect(card.summary).toEqual({ solid: 1, okay: 0, shaky: 1, unmarked: 5, total: 7 });
    } finally {
      await close();
    }
  });

  it("a question_bank with no parseable question has notice no_questions and questionCount 0", async () => {
    const { s, close, opportunityId } = await setup("hub3@example.com");
    try {
      await push(s, opportunityId, [doc("answers-full", "question_bank", PACKET_ANSWERS)]);
      const view = await hub(s, opportunityId);
      expect(view.banks).toHaveLength(1);
      expect(view.banks[0]).toMatchObject({ notice: "no_questions", questionCount: 0, needsRebuild: false });
      expect(view.empty).toBe(true);
    } finally {
      await close();
    }
  });

  it("a call_card with no questions gets no card at all", async () => {
    const { s, close, opportunityId } = await setup("hub4@example.com");
    try {
      await push(s, opportunityId, [doc("call-card", "call_card", PACKET_CALL_CARD)]);
      const view = await hub(s, opportunityId);
      expect(view.banks).toEqual([]);
      expect(view.groups).toEqual([]);
    } finally {
      await close();
    }
  });

  it("a call_card with questions gets a card", async () => {
    const { s, close, opportunityId } = await setup("hub5@example.com");
    try {
      await push(s, opportunityId, [doc("call-card", "call_card", SMALL_BANK)]);
      const view = await hub(s, opportunityId);
      expect(view.banks).toHaveLength(1);
      expect(view.banks[0]).toMatchObject({ kind: "call_card", questionCount: 2, notice: null });
    } finally {
      await close();
    }
  });

  it("needsRebuild is true when the body parses to questions and the rows are missing", async () => {
    const { s, close, opportunityId } = await setup("hub6@example.com");
    try {
      await insertDoc(s, opportunityId, "bank", "question_bank", SMALL_BANK);
      const view = await hub(s, opportunityId);
      expect(view.banks[0]).toMatchObject({ needsRebuild: true, questionCount: 0, notice: null });
      expect(view.empty).toBe(false);
    } finally {
      await close();
    }
  });

  it("needsRebuild is false for a body that parses to zero questions", async () => {
    const { s, close, opportunityId } = await setup("hub7@example.com");
    try {
      await insertDoc(s, opportunityId, "bank", "question_bank", PACKET_ANSWERS);
      const view = await hub(s, opportunityId);
      expect(view.banks[0].needsRebuild).toBe(false);
    } finally {
      await close();
    }
  });

  it("warnings come from re-parsing the current body: unknown label, marker inside quote, unresolved include", async () => {
    const { s, close, opportunityId } = await setup("hub8@example.com");
    try {
      await push(s, opportunityId, [doc("bank", "question_bank", NWT_BANK)]);
      const [card] = (await hub(s, opportunityId)).banks;
      expect(new Set(card.warnings.map((w) => w.code))).toEqual(
        new Set(["unknown_label", "marker_inside_quote", "unresolved_include"]),
      );
    } finally {
      await close();
    }
  });

  it("an include resolves against another document of the job, so it is not a warning", async () => {
    const { s, close, opportunityId } = await setup("hub8b@example.com");
    try {
      const curveballs = `### 2. "Describe a conflict"\n\n**Say:** I talk to the person first.\n`;
      const bank = `### 1. "Describe a conflict"\n\n{{include nwt-curveballs.md 2}}\n`;
      await push(s, opportunityId, [doc("bank", "question_bank", bank), doc("curveballs", "question_bank", curveballs)]);
      const view = await hub(s, opportunityId);
      expect(view.banks.find((b) => b.key === "bank")!.warnings).toEqual([]);
    } finally {
      await close();
    }
  });

  it("questions list carries each row's mark level and the unfilled flag", async () => {
    const { s, close, opportunityId } = await setup("hub9@example.com");
    try {
      await push(s, opportunityId, [doc("bank", "question_bank", NWT_BANK)]);
      const rows = await s.prepQuestion.listForJob(opportunityId);
      const second = rows.find((r) => r.number === 2)!;
      await s.prepMark.applyMark({ scope: "job", opportunityId, questionKey: second.questionKey, level: "okay", markedAt: new Date("2026-04-01T01:00:00Z"), drilled: false });
      const { questions } = await hub(s, opportunityId);
      expect(questions).toHaveLength(7);
      const q2 = questions.find((q) => q.number === 2)!;
      expect(q2).toMatchObject({ artifactKey: "bank", section: "Motivation", level: "okay", unfilled: false, hasAnswer: true, questionKey: second.questionKey });
      const q3 = questions.find((q) => q.number === 3)!;
      expect(q3).toMatchObject({ unfilled: true, hasAnswer: false, level: null });
      expect(questions.map((q) => q.position)).toEqual([0, 1, 2, 3, 4, 5, 6]);
    } finally {
      await close();
    }
  });

  it("empty is true when the job has no question_bank or call_card with questions", async () => {
    const { s, close, opportunityId } = await setup("hub10@example.com");
    try {
      expect((await hub(s, opportunityId)).empty).toBe(true);
      await push(s, opportunityId, [doc("pitch", "pitch", "# Pitch")]);
      expect((await hub(s, opportunityId)).empty).toBe(true);
      await push(s, opportunityId, [doc("bank", "question_bank", SMALL_BANK)]);
      expect((await hub(s, opportunityId)).empty).toBe(false);
    } finally {
      await close();
    }
  });

  it("lists the job's pitches as { key, title } for the Listen button", async () => {
    const { s, close, opportunityId } = await setup("hub-pitch@example.com");
    try {
      await push(s, opportunityId, [
        doc("pitch", "pitch", "# Pitch\n\n## Short\n\nHi.", { title: "Portfolio pitch" }),
        doc("bank", "question_bank", SMALL_BANK),
      ]);
      const view = await hub(s, opportunityId);
      expect(view.pitches).toEqual([{ key: "pitch", title: "Portfolio pitch" }]);
      expect(view.banks.map((b) => b.key)).toEqual(["bank"]);
    } finally {
      await close();
    }
  });

  it("audio status is { state: 'browser' } in this milestone", async () => {
    const { s, close, opportunityId } = await setup("hub11@example.com");
    try {
      await push(s, opportunityId, [doc("bank", "question_bank", SMALL_BANK)]);
      expect((await hub(s, opportunityId)).banks[0].audio).toEqual({ state: "browser" });
    } finally {
      await close();
    }
  });

  it("each bank carries its audio status from the segment plan when an audio context is given", async () => {
    const { s, close, opportunityId } = await setup("hub-audio@example.com");
    try {
      await push(s, opportunityId, [doc("bank", "question_bank", SMALL_BANK)]);
      const docs = await s.artifact.listLatestForOpportunity(opportunityId);
      const stages = await s.stage.listForOpportunity(opportunityId);
      const audio = { identity: { provider: "fake", model: "fake-tts" }, voices: { interviewer: "Vivian", candidate: "Ryan" }, ttsOn: true };
      const withTts = await loadPrepHub(s, { opportunityId, docs, stages, audio });
      expect(withTts.banks[0].audio).toEqual({ state: "partial", done: 0, total: 4 });
      const off = await loadPrepHub(s, { opportunityId, docs, stages, audio: { ...audio, ttsOn: false } });
      expect(off.banks[0].audio).toEqual({ state: "browser" });
      const none = await loadPrepHub(s, { opportunityId, docs, stages });
      expect(none.banks[0].audio).toEqual({ state: "browser" });
    } finally {
      await close();
    }
  });
});
