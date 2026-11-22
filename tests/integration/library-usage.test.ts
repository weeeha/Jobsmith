import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { makeTestDb, createTestUser } from "../helpers/db";
import { scoped, type Scoped } from "@/lib/db/scoped";
import * as schema from "@/lib/db/schema";
import { createOpportunity } from "@/lib/pipeline/create";
import { markHistory, usedInJobs, usedInText } from "@/lib/library/usage";
import { questionKey } from "@/lib/prep/question-key";
import { expectOk } from "../helpers/result";

const QUESTION = "Tell me about yourself";
const KEY = questionKey(QUESTION);

async function setup() {
  const { db, close } = await makeTestDb();
  const a = await createTestUser(db, "a@example.com");
  const b = await createTestUser(db, "b@example.com");
  return { db, close, a: scoped(db, a.id), b: scoped(db, b.id) };
}

async function job(s: Scoped, company: string, role = "Designer") {
  return expectOk(await createOpportunity(s, { companyName: company, roleTitle: role }));
}

// Rows of one question key in one job. `count` rows in two documents.
async function addRows(s: Scoped, opportunityId: string, key: string, text = QUESTION, documents = 1) {
  for (let d = 0; d < documents; d += 1) {
    const artifactKey = `${key}-${d}`;
    const artifact = await s.artifact.insert({
      opportunityId,
      companyId: null,
      stageId: null,
      key: artifactKey,
      version: 1,
      kind: "question_bank",
      title: artifactKey,
      bodyMd: "x",
      contentHash: `h-${artifactKey}`,
      sourceHash: `h-${artifactKey}`,
      origin: "pushed",
    });
    await s.prepQuestion.replaceForArtifactKey(opportunityId, artifactKey, [
      {
        opportunityId,
        artifactId: artifact.id,
        artifactVersion: 1,
        artifactKey,
        number: 1,
        position: 0,
        question: text,
        questionKey: questionKey(text),
      },
    ]);
  }
}

describe("usedInJobs", () => {
  it("usedInJobs counts distinct jobs per question key, not rows", async () => {
    const { a, close } = await setup();
    try {
      const one = await job(a, "Northwind Traders");
      const two = await job(a, "Contoso Ltd");
      await addRows(a, one.id, "bank", QUESTION, 2);
      await addRows(a, two.id, "bank", QUESTION, 1);
      await addRows(a, two.id, "other", "Why Northwind?", 1);
      const counts = await usedInJobs(a, [KEY, questionKey("Why Northwind?")]);
      expect(counts.get(KEY)).toBe(2);
      expect(counts.get(questionKey("Why Northwind?"))).toBe(1);
    } finally {
      await close();
    }
  });

  it("a key that no row holds counts 0", async () => {
    const { a, close } = await setup();
    try {
      const counts = await usedInJobs(a, ["ffffffffffffffff", KEY]);
      expect(counts.get("ffffffffffffffff")).toBe(0);
      expect(counts.get(KEY)).toBe(0);
      expect(await usedInJobs(a, [])).toEqual(new Map());
    } finally {
      await close();
    }
  });

  it("a closed job still counts", async () => {
    const { a, close } = await setup();
    try {
      const one = await job(a, "Northwind Traders");
      await addRows(a, one.id, "bank");
      await a.opportunity.update(one.id, { status: "closed", closedReason: "ghosted", closedAt: new Date() });
      expect((await usedInJobs(a, [KEY])).get(KEY)).toBe(1);
    } finally {
      await close();
    }
  });

  it("usedInJobs never counts another user's rows", async () => {
    const { a, b, close } = await setup();
    try {
      const mine = await job(a, "Northwind Traders");
      const theirs = await job(b, "Northwind Traders");
      await addRows(a, mine.id, "bank");
      await addRows(b, theirs.id, "bank");
      expect((await usedInJobs(a, [KEY])).get(KEY)).toBe(1);
      expect((await b.prepQuestion.countJobsByQuestionKey([KEY])).get(KEY)).toBe(1);
    } finally {
      await close();
    }
  });
});

describe("markHistory", () => {
  it("markHistory lists every job's mark for the key with dates and the library mark when there is one", async () => {
    const { a, close } = await setup();
    try {
      const one = await job(a, "Northwind Traders", "Senior Designer");
      const two = await job(a, "Contoso Ltd", "Design Lead");
      await addRows(a, one.id, "bank");
      await addRows(a, two.id, "bank");
      const early = new Date("2026-11-01T10:00:00Z");
      const late = new Date("2026-11-10T10:00:00Z");
      await a.prepMark.applyMark({ scope: "job", opportunityId: one.id, questionKey: KEY, level: "shaky", markedAt: early, drilled: false });
      await a.prepMark.applyMark({ scope: "job", opportunityId: two.id, questionKey: KEY, level: "solid", markedAt: late, drilled: true });
      await a.prepMark.applyMark({ scope: "library", opportunityId: null, questionKey: KEY, level: "okay", markedAt: late, drilled: true });
      await a.prepMark.applyMark({ scope: "job", opportunityId: one.id, questionKey: questionKey("Other"), level: "solid", markedAt: late, drilled: false });

      const history = await markHistory(a, KEY);
      expect(history.jobs.map((j) => j.opportunityId)).toEqual([two.id, one.id]);
      expect(history.jobs[0]).toMatchObject({
        companyName: "Contoso Ltd",
        roleTitle: "Design Lead",
        level: "solid",
        markedAt: late,
        drillCount: 1,
        lastDrilledAt: late,
      });
      expect(history.jobs[0].slug).toBeTruthy();
      expect(history.jobs[1]).toMatchObject({ level: "shaky", drillCount: 0, lastDrilledAt: null });
      expect(history.library).toEqual({ level: "okay", markedAt: late, drillCount: 1, lastDrilledAt: late });

      const empty = await markHistory(a, "ffffffffffffffff");
      expect(empty).toEqual({ jobs: [], library: null });
    } finally {
      await close();
    }
  });

  it("markHistory skips jobs that no longer exist and never shows another user's marks", async () => {
    const { db, a, b, close } = await setup();
    try {
      const gone = await job(a, "Northwind Traders");
      const kept = await job(a, "Contoso Ltd");
      await addRows(a, gone.id, "bank");
      await addRows(a, kept.id, "bank");
      const when = new Date("2026-11-01T10:00:00Z");
      await a.prepMark.applyMark({ scope: "job", opportunityId: gone.id, questionKey: KEY, level: "okay", markedAt: when, drilled: false });
      await a.prepMark.applyMark({ scope: "job", opportunityId: kept.id, questionKey: KEY, level: "solid", markedAt: when, drilled: false });
      await db.delete(schema.opportunity).where(eq(schema.opportunity.id, gone.id));

      const history = await markHistory(a, KEY);
      expect(history.jobs.map((j) => j.opportunityId)).toEqual([kept.id]);
      expect(await markHistory(b, KEY)).toEqual({ jobs: [], library: null });
    } finally {
      await close();
    }
  });
});

describe("usedInText", () => {
  it("usedInText is singular for one", () => {
    expect(usedInText(1)).toBe("Used in 1 job");
    expect(usedInText(3)).toBe("Used in 3 jobs");
    expect(usedInText(0)).toBe("Used in 0 jobs");
  });
});
