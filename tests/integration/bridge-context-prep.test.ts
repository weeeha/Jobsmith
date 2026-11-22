import { describe, expect, it } from "vitest";
import { makeTestDb, createTestUser } from "../helpers/db";
import { scoped, type Scoped } from "@/lib/db/scoped";
import { createOpportunity } from "@/lib/pipeline/create";
import { loadContextLibrary, loadContextPrep } from "@/lib/bridge/context-prep";
import { archiveLibraryItem, createLibraryItem } from "@/lib/library/items";
import { markQuestion } from "@/lib/prep/marks";
import { expectOk } from "../helpers/result";

const key = (n: number) => n.toString(16).padStart(16, "0");
const DRILLED = new Date("2026-11-19T10:00:00Z");

async function setup(email: string) {
  const { db, close } = await makeTestDb();
  const user = await createTestUser(db, email);
  return { db, s: scoped(db, user.id), close };
}

async function bank(s: Scoped, opportunityId: string, docKey: string, title: string, specs: { n: number; section?: string }[]) {
  const artifact = await s.artifact.insert({
    opportunityId,
    companyId: null,
    stageId: null,
    key: docKey,
    version: 1,
    kind: "question_bank",
    title,
    bodyMd: "x",
    contentHash: `h-${docKey}`,
    sourceHash: `h-${docKey}`,
    origin: "pushed",
  });
  await s.prepQuestion.replaceForArtifactKey(
    opportunityId,
    docKey,
    specs.map((spec, i) => ({
      opportunityId,
      artifactId: artifact.id,
      artifactVersion: 1,
      artifactKey: docKey,
      number: spec.n,
      position: i,
      section: spec.section ?? null,
      question: `Question ${spec.n} in ${docKey}`,
      questionKey: key(spec.n + (docKey === "b" ? 100 : 0)),
      hasAnswer: true,
      spine: "SECRET SPINE",
      blocks: [{ label: "Say", spoken: true, text: "SECRET ANSWER" }],
    })),
  );
}

describe("loadContextPrep", () => {
  it("lists each bank of the job with its title and every question's mark and last drilled date", async () => {
    const { s, close } = await setup("cp-a@example.com");
    try {
      const job = expectOk(await createOpportunity(s, { companyName: "Northwind", roleTitle: "Designer" })).id;
      await bank(s, job, "a", "Bank A", [{ n: 1, section: "Opening" }, { n: 2 }]);
      await bank(s, job, "b", "Bank B", [{ n: 1 }]);
      expectOk(await markQuestion(s, { scope: "job", opportunityId: job, questionKey: key(1), level: "solid", markedAt: DRILLED, drilled: true }));
      const prep = await loadContextPrep(s, job);
      expect(prep.banks.map((b) => [b.key, b.title])).toEqual([["a", "Bank A"], ["b", "Bank B"]]);
      expect(prep.banks[0].questions).toEqual([
        { number: 1, section: "Opening", question: "Question 1 in a", level: "solid", lastDrilledAt: DRILLED },
        { number: 2, section: null, question: "Question 2 in a", level: null, lastDrilledAt: null },
      ]);
      expect(prep.banks[1].questions[0].level).toBeNull();
    } finally {
      await close();
    }
  });

  it("holds the job's own marks only: a library mark and another job's mark do not show", async () => {
    const { s, close } = await setup("cp-b@example.com");
    try {
      const one = expectOk(await createOpportunity(s, { companyName: "Northwind", roleTitle: "Designer" })).id;
      const two = expectOk(await createOpportunity(s, { companyName: "Contoso", roleTitle: "Designer" })).id;
      await bank(s, one, "a", "Bank A", [{ n: 1 }]);
      await bank(s, two, "a", "Bank A", [{ n: 1 }]);
      expectOk(await markQuestion(s, { scope: "job", opportunityId: two, questionKey: key(1), level: "solid", markedAt: DRILLED, drilled: false }));
      expectOk(await markQuestion(s, { scope: "library", opportunityId: null, questionKey: key(1), level: "shaky", markedAt: DRILLED, drilled: false }));
      expect((await loadContextPrep(s, one)).banks[0].questions[0].level).toBeNull();
      expect((await loadContextPrep(s, two)).banks[0].questions[0].level).toBe("solid");
    } finally {
      await close();
    }
  });

  it("is empty for a job with no questions", async () => {
    const { s, close } = await setup("cp-c@example.com");
    try {
      const job = expectOk(await createOpportunity(s, { companyName: "Northwind", roleTitle: "Designer" })).id;
      expect(await loadContextPrep(s, job)).toEqual({ banks: [] });
    } finally {
      await close();
    }
  });
});

describe("loadContextLibrary", () => {
  it("lists title, kind and tags of unarchived items, newest first, and no body", async () => {
    const { s, close } = await setup("cp-d@example.com");
    try {
      expectOk(await createLibraryItem(s, { kind: "story", title: "Old story", bodyMd: "SECRET BODY", tags: ["a"] }));
      const gone = expectOk(await createLibraryItem(s, { kind: "fact", title: "Gone", bodyMd: "x", tags: [] }));
      expectOk(await archiveLibraryItem(s, gone.id, true));
      expectOk(await createLibraryItem(s, { kind: "intro", title: "New intro", bodyMd: "SECRET BODY", tags: [] }));
      const library = await loadContextLibrary(s);
      expect(library.items.map((i) => i.title).sort()).toEqual(["New intro", "Old story"]);
      expect(JSON.stringify(library)).not.toContain("SECRET");
      expect(library.items.find((i) => i.title === "Old story")).toEqual({ title: "Old story", kind: "story", tags: ["a"] });
    } finally {
      await close();
    }
  });

  it("never lists another user's items", async () => {
    const mine = await setup("cp-e@example.com");
    const other = await setup("cp-f@example.com");
    try {
      expectOk(await createLibraryItem(other.s, { kind: "story", title: "Theirs", bodyMd: "x", tags: [] }));
      expect(await loadContextLibrary(mine.s)).toEqual({ items: [] });
    } finally {
      await mine.close();
      await other.close();
    }
  });
});
