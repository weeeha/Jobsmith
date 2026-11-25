import { afterEach, describe, expect, it, vi } from "vitest";
import type { Db } from "@/lib/db/client";
import { scoped, type Scoped } from "@/lib/db/scoped";
import { createLibraryItemAction, saveToLibraryAction } from "@/app/(app)/library/actions";
import { createOpportunity } from "@/lib/pipeline/create";
import { questionKey } from "@/lib/prep/question-key";
import { makeTestDb, createTestUser } from "../helpers/db";
import { expectFail, expectOk } from "../helpers/result";

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

const QUESTION = "Tell me about yourself";
const KEY = questionKey(QUESTION);

async function signIn(db: Db, email: string): Promise<Scoped> {
  harness.db = db;
  const user = await createTestUser(db, email);
  harness.userId = user.id;
  return scoped(db, user.id);
}

async function jobWithAnswer(s: Scoped) {
  const opportunityId = expectOk(await createOpportunity(s, { companyName: "Northwind Traders", roleTitle: "Designer" })).id;
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
      question: QUESTION,
      questionKey: KEY,
      blocks: [{ label: "Say", spoken: true, text: "I design ordering tools." }],
      hasAnswer: true,
    },
  ]);
  return opportunityId;
}

function form(fields: Record<string, string | string[]>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) {
    for (const v of Array.isArray(value) ? value : [value]) data.append(key, v);
  }
  return data;
}

describe("library save actions", () => {
  it("saveToLibraryAction creates the item for the signed-in user and returns it", async () => {
    const { db, close } = await makeTestDb();
    try {
      const s = await signIn(db, "ls1@example.com");
      const opportunityId = await jobWithAnswer(s);
      const result = expectOk(await saveToLibraryAction({ opportunityId, questionKey: KEY }));
      expect(result.created).toBe(true);
      expect(await s.libraryItem.getById(result.id)).toMatchObject({ kind: "answer", title: QUESTION, bodyMd: "I design ordering tools.", sourceOpportunityId: opportunityId });
      expectFail(await saveToLibraryAction({ opportunityId, questionKey: "nope" }), "invalid");
      expectFail(await saveToLibraryAction({ opportunityId: "nope", questionKey: KEY }), "not_found");
    } finally {
      await close();
    }
  });

  it("saveToLibraryAction on an already saved question returns created false", async () => {
    const { db, close } = await makeTestDb();
    try {
      const s = await signIn(db, "ls2@example.com");
      const opportunityId = await jobWithAnswer(s);
      const first = expectOk(await saveToLibraryAction({ opportunityId, questionKey: KEY }));
      const second = expectOk(await saveToLibraryAction({ opportunityId, questionKey: KEY }));
      expect(second).toEqual({ id: first.id, created: false });
      expect(await s.libraryItem.listAll()).toHaveLength(1);
    } finally {
      await close();
    }
  });

  it("saveToLibraryAction never saves another user's question", async () => {
    const { db, close } = await makeTestDb();
    try {
      const owner = await signIn(db, "ls3@example.com");
      const opportunityId = await jobWithAnswer(owner);
      const other = await signIn(db, "ls4@example.com");
      expectFail(await saveToLibraryAction({ opportunityId, questionKey: KEY }), "not_found");
      expect(await other.libraryItem.listAll()).toEqual([]);
      expect(await owner.libraryItem.listAll()).toEqual([]);
    } finally {
      await close();
    }
  });

  it("createLibraryItemAction creates a story, an intro or a fact and refuses kind answer", async () => {
    const { db, close } = await makeTestDb();
    try {
      const s = await signIn(db, "ls5@example.com");
      for (const kind of ["story", "intro", "fact"]) {
        const result = await createLibraryItemAction(undefined, form({ kind, title: ` ${kind} title `, bodyMd: "Body", tags: ["a", "A", "b"] }));
        expect(result?.ok).toBe(true);
        if (result?.ok) {
          expect(await s.libraryItem.getById(result.data.id)).toMatchObject({ kind, title: `${kind} title`, tags: ["a", "b"], questionKey: null, sourceOpportunityId: null });
        }
      }
      const answer = await createLibraryItemAction(undefined, form({ kind: "answer", title: "Sneaky", bodyMd: "x" }));
      expect(answer).toMatchObject({ ok: false, code: "invalid", fieldErrors: { kind: "Choose story, intro or fact." } });
      const noTitle = await createLibraryItemAction(undefined, form({ kind: "story", title: " ", bodyMd: "x" }));
      expect(noTitle).toMatchObject({ ok: false, fieldErrors: { title: "Give the item a title." } });
      expect(await s.libraryItem.listAll()).toHaveLength(3);
    } finally {
      await close();
    }
  });
});
