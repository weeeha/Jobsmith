import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { makeTestDb, createTestUser } from "../helpers/db";
import { scoped, type Scoped } from "@/lib/db/scoped";
import { createOpportunity } from "@/lib/pipeline/create";
import { backfillPrep } from "@/lib/prep/backfill";
import { expectOk } from "../helpers/result";

// A job id the rebuild is told to fail on, to prove one job cannot stop the rest.
const failing = vi.hoisted(() => ({ opportunityId: null as string | null }));

vi.mock("@/lib/prep/rebuild", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/prep/rebuild")>();
  return {
    ...actual,
    rebuildForJob: (s: Scoped, opportunityId: string) => {
      if (opportunityId === failing.opportunityId) throw new Error("broken document");
      return actual.rebuildForJob(s, opportunityId);
    },
  };
});

const BANK = readFileSync(path.resolve(__dirname, "../fixtures/prep/nwt-answers-full.md"), "utf8");
const CALL_CARD = `### 1. "Open the call"\n\n**Say:** Thanks for making time.\n`;

// Inserted directly, as the documents of a job that existed before Prep shipped.
async function addDoc(s: Scoped, opportunityId: string, key: string, kind: "question_bank" | "call_card", bodyMd: string) {
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

async function job(s: Scoped, company: string) {
  return expectOk(await createOpportunity(s, { companyName: company, roleTitle: "Designer" })).id;
}

describe("backfillPrep", () => {
  it("creates rows for every existing question bank and call card across two jobs", async () => {
    const { db, close } = await makeTestDb();
    try {
      const user = await createTestUser(db, "bf1@example.com");
      const s = scoped(db, user.id);
      const a = await job(s, "Northwind Traders");
      const b = await job(s, "Contoso Goods");
      await addDoc(s, a, "answers-full", "question_bank", BANK);
      await addDoc(s, b, "call-card", "call_card", CALL_CARD);
      expect(await s.prepQuestion.listForJob(a)).toEqual([]);

      const summary = await backfillPrep(s);
      expect(summary).toEqual({ jobs: 2, documents: 2, questions: 8 });
      expect(await s.prepQuestion.listForJob(a)).toHaveLength(7);
      expect(await s.prepQuestion.listForJob(b)).toHaveLength(1);
    } finally {
      await close();
    }
  });

  it("is idempotent: a second run leaves the same rows and the same marks", async () => {
    const { db, close } = await makeTestDb();
    try {
      const user = await createTestUser(db, "bf2@example.com");
      const s = scoped(db, user.id);
      const a = await job(s, "Northwind Traders");
      await addDoc(s, a, "answers-full", "question_bank", BANK);
      await backfillPrep(s);
      const [first] = await s.prepQuestion.listForJob(a);
      await s.prepMark.applyMark({
        scope: "job",
        opportunityId: a,
        questionKey: first.questionKey,
        level: "solid",
        markedAt: new Date("2026-01-01T12:00:00Z"),
        drilled: false,
      });
      const shape = async () =>
        (await s.prepQuestion.listForJob(a)).map((r) => [r.number, r.questionKey, r.position]);
      const before = await shape();
      const marksBefore = (await s.prepMark.listForJob(a)).map((m) => [m.questionKey, m.level]);

      const again = await backfillPrep(s);
      expect(again.questions).toBe(7);
      expect(await shape()).toEqual(before);
      expect((await s.prepMark.listForJob(a)).map((m) => [m.questionKey, m.level])).toEqual(marksBefore);
    } finally {
      await close();
    }
  });

  it("a dry run counts questions and writes nothing", async () => {
    const { db, close } = await makeTestDb();
    try {
      const user = await createTestUser(db, "bf3@example.com");
      const s = scoped(db, user.id);
      const a = await job(s, "Northwind Traders");
      await addDoc(s, a, "answers-full", "question_bank", BANK);
      const summary = await backfillPrep(s, { dryRun: true });
      expect(summary).toEqual({ jobs: 1, documents: 1, questions: 7 });
      expect(await s.prepQuestion.listForJob(a)).toEqual([]);
    } finally {
      await close();
    }
  });

  it("one job's unparseable document does not stop the rest", async () => {
    const { db, close } = await makeTestDb();
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const user = await createTestUser(db, "bf4@example.com");
      const s = scoped(db, user.id);
      const a = await job(s, "Northwind Traders");
      const b = await job(s, "Contoso Goods");
      await addDoc(s, a, "answers-full", "question_bank", BANK);
      await addDoc(s, b, "call-card", "call_card", CALL_CARD);
      failing.opportunityId = a;

      const summary = await backfillPrep(s);
      expect(summary.questions).toBe(1);
      expect(summary.jobs).toBe(1);
      expect(await s.prepQuestion.listForJob(a)).toEqual([]);
      expect(await s.prepQuestion.listForJob(b)).toHaveLength(1);
      expect(error).toHaveBeenCalled();
      // The log names the job and never the document text.
      expect(JSON.stringify(error.mock.calls)).not.toContain("Tell me about yourself");
    } finally {
      failing.opportunityId = null;
      error.mockRestore();
      await close();
    }
  });

  it("only touches the caller's own jobs", async () => {
    const { db, close } = await makeTestDb();
    try {
      const alice = scoped(db, (await createTestUser(db, "bf5a@example.com")).id);
      const bob = scoped(db, (await createTestUser(db, "bf5b@example.com")).id);
      const a = await job(alice, "Northwind Traders");
      const b = await job(bob, "Contoso Goods");
      await addDoc(alice, a, "answers-full", "question_bank", BANK);
      await addDoc(bob, b, "answers-full", "question_bank", BANK);

      await backfillPrep(alice);
      expect(await alice.prepQuestion.listForJob(a)).toHaveLength(7);
      expect(await bob.prepQuestion.listForJob(b)).toEqual([]);
    } finally {
      await close();
    }
  });
});
