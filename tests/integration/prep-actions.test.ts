import { afterEach, describe, expect, it, vi } from "vitest";
import type { Db } from "@/lib/db/client";
import { scoped, type Scoped } from "@/lib/db/scoped";
import { createOpportunity } from "@/lib/pipeline/create";
import {
  markQuestionAction,
  rebuildQuestionsAction,
  startSessionAction,
  endSessionAction,
} from "@/app/(app)/jobs/[slug]/prep-actions";
import { questionKey } from "@/lib/prep/question-key";
import { makeTestDb, createTestUser } from "../helpers/db";
import { expectFail, expectOk } from "../helpers/result";

// Same harness as job-actions.test.ts: the signed-in user needs a live
// request, so it is stubbed; scopedFor points at a real PGlite database.
const harness = vi.hoisted(() => ({ db: undefined as Db | undefined, userId: "" }));

vi.mock("@/lib/auth/session", () => ({
  requireUser: async () => ({ id: harness.userId }),
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

vi.mock("@/lib/db/scoped", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/db/scoped")>();
  return { ...actual, scopedFor: (userId: string) => actual.scoped(harness.db!, userId) };
});

afterEach(() => {
  vi.restoreAllMocks();
});

const BODY = `### 1. "Tell me about yourself"\n\n**Spine:** Craft, then range.\n\n**Say:** I design ordering tools.\n\n### 2. "Why us?"\n\n**Say:** You sell to shops.\n`;
const KEY = questionKey("Tell me about yourself");

async function signIn(db: Db, email: string): Promise<Scoped> {
  harness.db = db;
  const user = await createTestUser(db, email);
  harness.userId = user.id;
  return scoped(db, user.id);
}

async function jobWithBank(s: Scoped, withRows = true) {
  const opportunityId = expectOk(await createOpportunity(s, { companyName: "Northwind Traders", roleTitle: "Designer" })).id;
  const artifact = await s.artifact.insert({
    opportunityId,
    companyId: null,
    stageId: null,
    key: "bank",
    version: 1,
    kind: "question_bank",
    title: "bank",
    bodyMd: BODY,
    contentHash: "h",
    sourceHash: "h",
    origin: "pushed",
  });
  if (withRows) {
    await s.prepQuestion.replaceForArtifactKey(opportunityId, "bank", [
      {
        opportunityId,
        artifactId: artifact.id,
        artifactVersion: 1,
        artifactKey: "bank",
        number: 1,
        position: 0,
        question: "Tell me about yourself",
        questionKey: KEY,
      },
    ]);
  }
  return opportunityId;
}

describe("prep actions", () => {
  it("markQuestionAction writes the mark for the signed-in user and returns it with applied", async () => {
    const { db, close } = await makeTestDb();
    try {
      const s = await signIn(db, "pa1@example.com");
      const opportunityId = await jobWithBank(s);
      const result = expectOk(
        await markQuestionAction({ opportunityId, scope: "job", questionKey: KEY, level: "solid", markedAt: "2026-05-01T10:00:00.000Z", drilled: false }),
      );
      expect(result).toEqual({ level: "solid", markedAt: "2026-05-01T10:00:00.000Z", drillCount: 0, applied: true });
      expect((await s.prepMark.find("job", opportunityId, KEY))?.level).toBe("solid");
      const older = expectOk(
        await markQuestionAction({ opportunityId, scope: "job", questionKey: KEY, level: "shaky", markedAt: "2026-05-01T09:00:00.000Z", drilled: false }),
      );
      expect(older).toMatchObject({ level: "solid", applied: false });
    } finally {
      await close();
    }
  });

  it("markQuestionAction rejects a malformed question key with the explicit Zod message", async () => {
    const { db, close } = await makeTestDb();
    try {
      const s = await signIn(db, "pa2@example.com");
      const opportunityId = await jobWithBank(s);
      const result = await markQuestionAction({ opportunityId, scope: "job", questionKey: "bad", level: "solid", markedAt: "2026-05-01T10:00:00.000Z", drilled: false });
      expectFail(result, "invalid");
      if (!result.ok) expect(result.message).toBe("That question key is not valid.");
      expect(await s.prepMark.listForJob(opportunityId)).toEqual([]);
    } finally {
      await close();
    }
  });

  it("rebuildQuestionsAction rebuilds from the stored body and returns the row count", async () => {
    const { db, close } = await makeTestDb();
    try {
      const s = await signIn(db, "pa3@example.com");
      const opportunityId = await jobWithBank(s, false);
      expect(await s.prepQuestion.listForJob(opportunityId)).toEqual([]);
      expect(expectOk(await rebuildQuestionsAction(opportunityId))).toEqual({ rows: 2 });
      expect(await s.prepQuestion.listForJob(opportunityId)).toHaveLength(2);
    } finally {
      await close();
    }
  });

  it("startSessionAction and endSessionAction round-trip and the end writes the event", async () => {
    const { db, close } = await makeTestDb();
    try {
      const s = await signIn(db, "pa4@example.com");
      const opportunityId = await jobWithBank(s);
      const { id } = expectOk(await startSessionAction({ opportunityId, mode: "quick_fire", questions: 10, meta: { doc: "bank" } }));
      expect((await s.prepSession.getById(id))?.mode).toBe("quick_fire");
      expect(expectOk(await endSessionAction({ id, seen: 10, marked: 4, solid: 3 }))).toEqual({ eventWritten: true });
      const events = (await s.event.listForOpportunity(opportunityId)).filter((e) => e.kind === "prep_drilled");
      expect(events.map((e) => e.body)).toEqual(["Drilled 10 questions, 3 marked solid"]);
      expect(expectOk(await endSessionAction({ id, seen: 10, marked: 4, solid: 3 }))).toEqual({ eventWritten: false });
    } finally {
      await close();
    }
  });

  it("rejects a bad mode and a negative count with an explicit message", async () => {
    const { db, close } = await makeTestDb();
    try {
      const s = await signIn(db, "pa5@example.com");
      const opportunityId = await jobWithBank(s);
      expectFail(await startSessionAction({ opportunityId, mode: "marathon" as never, questions: 10 }), "invalid");
      expectFail(await startSessionAction({ opportunityId, mode: "drill", questions: -1 }), "invalid");
      expectFail(await endSessionAction({ id: "not-a-uuid", seen: 1, marked: 0, solid: 0 }), "not_found");
    } finally {
      await close();
    }
  });

  it("every action returns not_found for another user's job", async () => {
    const { db, close } = await makeTestDb();
    try {
      const owner = await signIn(db, "pa6a@example.com");
      const theirs = await jobWithBank(owner);
      const session = expectOk(await startSessionAction({ opportunityId: theirs, mode: "drill", questions: 5 }));
      await signIn(db, "pa6b@example.com");

      expectFail(
        await markQuestionAction({ opportunityId: theirs, scope: "job", questionKey: KEY, level: "solid", markedAt: "2026-05-01T10:00:00.000Z", drilled: false }),
        "not_found",
      );
      expectFail(await rebuildQuestionsAction(theirs), "not_found");
      expectFail(await startSessionAction({ opportunityId: theirs, mode: "drill", questions: 5 }), "not_found");
      expectFail(await endSessionAction({ id: session.id, seen: 5, marked: 0, solid: 0 }), "not_found");
      expect(await owner.prepMark.listForJob(theirs)).toEqual([]);
      expect((await owner.prepSession.getById(session.id))?.endedAt).toBeNull();
    } finally {
      await close();
    }
  });
});
