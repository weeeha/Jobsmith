import { describe, expect, it } from "vitest";
import { makeTestDb, createTestUser } from "../helpers/db";
import { scoped, type Scoped } from "@/lib/db/scoped";
import { createOpportunity } from "@/lib/pipeline/create";
import { saveQuestionToLibrary } from "@/lib/library/promote";
import { getLibraryItem } from "@/lib/library/items";
import { questionKey } from "@/lib/prep/question-key";
import type { ParsedBlock } from "@/lib/prep/parse";
import { expectFail, expectOk } from "../helpers/result";

const QUESTION = "Tell me about yourself";
const KEY = questionKey(QUESTION);

async function setup(email = "a@example.com") {
  const { db, close } = await makeTestDb();
  const user = await createTestUser(db, email);
  const s = scoped(db, user.id);
  return { db, close, s };
}

async function job(s: Scoped, company = "Northwind Traders") {
  const created = expectOk(await createOpportunity(s, { companyName: company, roleTitle: "Designer" }));
  return created.id;
}

async function addQuestion(s: Scoped, opportunityId: string, blocks: ParsedBlock[], key = "bank", text = QUESTION) {
  const artifact = await s.artifact.insert({
    opportunityId,
    companyId: null,
    stageId: null,
    key,
    version: 1,
    kind: "question_bank",
    title: key,
    bodyMd: "x",
    contentHash: `h-${key}`,
    sourceHash: `h-${key}`,
    origin: "pushed",
  });
  await s.prepQuestion.replaceForArtifactKey(opportunityId, key, [
    {
      opportunityId,
      artifactId: artifact.id,
      artifactVersion: 1,
      artifactKey: key,
      number: 1,
      position: 0,
      question: text,
      questionKey: questionKey(text),
      blocks,
      hasAnswer: blocks.some((b) => b.spoken),
    },
  ]);
  return artifact.id;
}

const say = (text: string): ParsedBlock => ({ label: "Say", spoken: true, text });
const long = (text: string): ParsedBlock => ({ label: "Long version", spoken: true, text });

describe("saveQuestionToLibrary", () => {
  it("creates an answer item from Say and Long version with the question as title and the job as source", async () => {
    const { s, close } = await setup();
    try {
      const opportunityId = await job(s);
      const artifactId = await addQuestion(s, opportunityId, [say("I design pricing flows."), long("Longer story here.")]);
      const result = expectOk(await saveQuestionToLibrary(s, { opportunityId, questionKey: KEY }));
      expect(result.created).toBe(true);
      const item = await getLibraryItem(s, result.id);
      expect(item).toMatchObject({
        kind: "answer",
        title: QUESTION,
        bodyMd: "I design pricing flows.\n\n**Long version:** Longer story here.",
        tags: [],
        questionKey: KEY,
        sourceOpportunityId: opportunityId,
        sourceArtifactId: artifactId,
      });
    } finally {
      await close();
    }
  });

  it("a question with only a Say block makes a body of just that text", async () => {
    const { s, close } = await setup();
    try {
      const opportunityId = await job(s);
      await addQuestion(s, opportunityId, [{ label: "say:", spoken: true, text: "Just this." }]);
      const result = expectOk(await saveQuestionToLibrary(s, { opportunityId, questionKey: KEY }));
      expect((await getLibraryItem(s, result.id))?.bodyMd).toBe("Just this.");
    } finally {
      await close();
    }
  });

  it("a question with neither block is invalid", async () => {
    const { s, close } = await setup();
    try {
      const opportunityId = await job(s);
      await addQuestion(s, opportunityId, [{ label: "Spine", spoken: false, text: "A note" }, { label: "Tie to the posting", spoken: true, text: "Other spoken" }]);
      const result = await saveQuestionToLibrary(s, { opportunityId, questionKey: KEY });
      expectFail(result, "invalid");
      if (!result.ok) expect(result.message).toBe("This question has no answer to save.");
      expect(await s.libraryItem.listAll()).toEqual([]);
    } finally {
      await close();
    }
  });

  it("saving the same question from the same job returns the existing item and created false", async () => {
    const { s, close } = await setup();
    try {
      const opportunityId = await job(s);
      await addQuestion(s, opportunityId, [say("One answer.")]);
      const first = expectOk(await saveQuestionToLibrary(s, { opportunityId, questionKey: KEY }));
      const second = expectOk(await saveQuestionToLibrary(s, { opportunityId, questionKey: KEY }));
      expect(second).toEqual({ id: first.id, created: false });
      expect(await s.libraryItem.listAll()).toHaveLength(1);
    } finally {
      await close();
    }
  });

  it("the same question key from a second job creates a second item", async () => {
    const { s, close } = await setup();
    try {
      const one = await job(s, "Northwind Traders");
      const two = await job(s, "Contoso Ltd");
      await addQuestion(s, one, [say("Answer one.")]);
      await addQuestion(s, two, [say("Answer two.")]);
      const a = expectOk(await saveQuestionToLibrary(s, { opportunityId: one, questionKey: KEY }));
      const b = expectOk(await saveQuestionToLibrary(s, { opportunityId: two, questionKey: KEY }));
      expect(b.created).toBe(true);
      expect(b.id).not.toBe(a.id);
      expect(await s.libraryItem.listAll()).toHaveLength(2);
    } finally {
      await close();
    }
  });

  it("another user's job or an unknown question key is not_found", async () => {
    const { db, s, close } = await setup();
    try {
      const other = scoped(db, (await createTestUser(db, "b@example.com")).id);
      const opportunityId = await job(s);
      await addQuestion(s, opportunityId, [say("Mine.")]);
      expectFail(await saveQuestionToLibrary(other, { opportunityId, questionKey: KEY }), "not_found");
      expectFail(await saveQuestionToLibrary(s, { opportunityId, questionKey: "ffffffffffffffff" }), "not_found");
      expectFail(await saveQuestionToLibrary(s, { opportunityId: crypto.randomUUID(), questionKey: KEY }), "not_found");
      expect(await s.libraryItem.listAll()).toEqual([]);
      expect(await other.libraryItem.listAll()).toEqual([]);
    } finally {
      await close();
    }
  });

  it("the saved item's question_key equals the row's and the source artifact id is the artifact that holds it", async () => {
    const { s, close } = await setup();
    try {
      const opportunityId = await job(s);
      await addQuestion(s, opportunityId, [say("In the first bank.")], "alpha");
      const secondArtifact = await addQuestion(s, opportunityId, [say("In the second bank.")], "beta", "Why Northwind?");
      const result = expectOk(await saveQuestionToLibrary(s, { opportunityId, questionKey: questionKey("Why Northwind?") }));
      const item = await getLibraryItem(s, result.id);
      expect(item?.questionKey).toBe(questionKey("Why Northwind?"));
      expect(item?.sourceArtifactId).toBe(secondArtifact);
    } finally {
      await close();
    }
  });
});
