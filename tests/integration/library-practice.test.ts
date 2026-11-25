import { describe, expect, it } from "vitest";
import { makeTestDb, createTestUser } from "../helpers/db";
import { scoped, type Scoped } from "@/lib/db/scoped";
import { createOpportunity } from "@/lib/pipeline/create";
import { closeOpportunity } from "@/lib/pipeline/close";
import { createLibraryItem } from "@/lib/library/items";
import { loadLibraryQuickFirePool } from "@/lib/library/practice";
import { archiveLibraryItem } from "@/lib/library/items";
import { markQuestion } from "@/lib/prep/marks";
import { endSession, startSession } from "@/lib/prep/sessions";
import { expectOk } from "../helpers/result";

const key = (n: number) => n.toString(16).padStart(16, "0");
const NOW = new Date("2026-11-21T12:00:00Z");

async function setup(email = "lp-a@example.com") {
  const { db, close } = await makeTestDb();
  const user = await createTestUser(db, email);
  return { s: scoped(db, user.id), close, db };
}

async function job(s: Scoped, company: string) {
  return expectOk(await createOpportunity(s, { companyName: company, roleTitle: "Designer" })).id;
}

async function addRows(s: Scoped, opportunityId: string, docKey: string, rows: { n: number; spine: string | null; text?: string }[]) {
  const artifact = await s.artifact.insert({
    opportunityId,
    companyId: null,
    stageId: null,
    key: docKey,
    version: 1,
    kind: "question_bank",
    title: docKey,
    bodyMd: "x",
    contentHash: `h-${docKey}`,
    sourceHash: `h-${docKey}`,
    origin: "pushed",
  });
  await s.prepQuestion.replaceForArtifactKey(
    opportunityId,
    docKey,
    rows.map((r, i) => ({
      opportunityId,
      artifactId: artifact.id,
      artifactVersion: 1,
      artifactKey: docKey,
      number: r.n,
      position: i,
      question: r.text ?? `Question ${r.n}`,
      questionKey: key(r.n),
      hasAnswer: true,
      spine: r.spine,
      blocks: [{ label: "Say", spoken: true, text: `Answer ${r.n}` }],
    })),
  );
}

const item = (s: Scoped, title: string, bodyMd: string, questionKey?: string) =>
  createLibraryItem(s, { kind: "answer", title, bodyMd, tags: [] }, questionKey ? { questionKey } : {});

describe("loadLibraryQuickFirePool", () => {
  it("holds rows with a Spine from active jobs only, and items with a question key", async () => {
    const { s, close } = await setup();
    try {
      const a = await job(s, "Northwind");
      const b = await job(s, "Contoso");
      await addRows(s, a, "bank", [{ n: 1, spine: "Spine 1" }, { n: 2, spine: null }]);
      await addRows(s, b, "bank", [{ n: 3, spine: "Spine 3" }]);
      expectOk(await item(s, "Item title", "Item body\nsecond line", key(9)));
      expectOk(await item(s, "Story without key", "A story"));
      const pool = await loadLibraryQuickFirePool(s);
      expect(pool.map((q) => q.questionKey).sort()).toEqual([key(1), key(3), key(9)]);
      const fromItem = pool.find((q) => q.questionKey === key(9));
      expect(fromItem).toMatchObject({ question: "Item title", spine: "Item body", source: "library" });
      expect(pool.find((q) => q.questionKey === key(1))).toMatchObject({ source: "job", spine: "Spine 1" });
    } finally {
      await close();
    }
  });

  it("keeps one entry per question key and a row's Spine wins over an item's first line", async () => {
    const { s, close } = await setup("lp-b@example.com");
    try {
      const a = await job(s, "Northwind");
      const b = await job(s, "Contoso");
      await addRows(s, a, "bank", [{ n: 1, spine: "Row spine" }]);
      await addRows(s, b, "bank", [{ n: 1, spine: "Other row spine" }]);
      expectOk(await item(s, "Question 1", "Item first line", key(1)));
      const pool = (await loadLibraryQuickFirePool(s)).filter((q) => q.questionKey === key(1));
      expect(pool).toHaveLength(1);
      expect(pool[0].source).toBe("job");
      expect(["Row spine", "Other row spine"]).toContain(pool[0].spine);
    } finally {
      await close();
    }
  });

  it("leaves out an archived item and a closed job's rows", async () => {
    const { s, close } = await setup("lp-c@example.com");
    try {
      const a = await job(s, "Northwind");
      const b = await job(s, "Contoso");
      await addRows(s, a, "bank", [{ n: 1, spine: "Spine 1" }]);
      await addRows(s, b, "bank", [{ n: 2, spine: "Spine 2" }]);
      expectOk(await closeOpportunity(s, b, "rejected"));
      const archived = expectOk(await item(s, "Gone", "Body", key(7)));
      expectOk(await archiveLibraryItem(s, archived.id, true));
      const pool = await loadLibraryQuickFirePool(s);
      expect(pool.map((q) => q.questionKey)).toEqual([key(1)]);
    } finally {
      await close();
    }
  });

  it("never shows another user's rows or items", async () => {
    const { s, close, db } = await setup("lp-d@example.com");
    try {
      const other = scoped(db, (await createTestUser(db, "lp-e@example.com")).id);
      const a = await job(other, "Elsewhere");
      await addRows(other, a, "bank", [{ n: 1, spine: "Theirs" }]);
      expectOk(await item(other, "Theirs", "Body", key(2)));
      expect(await loadLibraryQuickFirePool(s)).toEqual([]);
    } finally {
      await close();
    }
  });

  it("a library round writes marks with scope library and no opportunity id", async () => {
    const { s, close } = await setup("lp-f@example.com");
    try {
      const a = await job(s, "Northwind");
      await addRows(s, a, "bank", [{ n: 1, spine: "Spine 1" }]);
      expectOk(await markQuestion(s, { scope: "library", opportunityId: null, questionKey: key(1), level: "shaky", markedAt: NOW, drilled: false }));
      const library = await s.prepMark.listLibrary();
      expect(library).toHaveLength(1);
      expect(library[0]).toMatchObject({ scope: "library", opportunityId: null, level: "shaky" });
      expect(await s.prepMark.listForJob(a)).toEqual([]);
      const pool = await loadLibraryQuickFirePool(s);
      expect(pool[0].level).toBe("shaky");
    } finally {
      await close();
    }
  });

  it("ending a library session writes no prep_drilled event", async () => {
    const { s, close } = await setup("lp-g@example.com");
    try {
      const a = await job(s, "Northwind");
      const started = expectOk(await startSession(s, { opportunityId: null, mode: "quick_fire", questions: 3 }));
      const ended = expectOk(await endSession(s, { id: started.id, seen: 3, marked: 1, solid: 1 }));
      expect(ended.eventWritten).toBe(false);
      expect((await s.event.listForOpportunity(a)).filter((e) => e.kind === "prep_drilled")).toEqual([]);
    } finally {
      await close();
    }
  });
});
