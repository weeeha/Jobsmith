import { afterEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import * as schema from "@/lib/db/schema";
import { makeTestDb, createTestUser } from "../helpers/db";
import { scoped, type Scoped } from "@/lib/db/scoped";
import type { Db } from "@/lib/db/client";
import { createOpportunity } from "@/lib/pipeline/create";
import { markQuestionAction } from "@/app/(app)/jobs/[slug]/prep-actions";
import { createMemoryStore, type QueuedMark } from "@/lib/offline/queue";
import { drainQueue, persistAction, sendQueuedMark } from "@/lib/offline/sync";
import { expectOk } from "../helpers/result";

const harness = vi.hoisted(() => ({ db: undefined as Db | undefined, userId: "" }));
vi.mock("@/lib/auth/session", () => ({ requireUser: async () => ({ id: harness.userId }) }));
vi.mock("@/lib/db/scoped", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/db/scoped")>();
  return { ...actual, scopedFor: (userId: string) => actual.scoped(harness.db!, userId) };
});

const KEY = "00000000000000a1";
const closers: (() => Promise<void>)[] = [];
afterEach(async () => {
  while (closers.length) await closers.pop()!();
});

async function setup(email: string) {
  const { db, close } = await makeTestDb();
  closers.push(close);
  const user = await createTestUser(db, email);
  harness.db = db;
  harness.userId = user.id;
  const s: Scoped = scoped(db, user.id);
  const opportunityId = expectOk(await createOpportunity(s, { companyName: "Northwind Traders", roleTitle: "Designer" })).id;
  const artifact = await s.artifact.insert({
    opportunityId, companyId: null, stageId: null, key: "bank", version: 1, kind: "question_bank",
    title: "Bank", bodyMd: "x", contentHash: "h", sourceHash: "h", origin: "pushed",
  });
  await s.prepQuestion.replaceForArtifactKey(opportunityId, "bank", [
    {
      opportunityId, artifactId: artifact.id, artifactVersion: 1, artifactKey: "bank", number: 1, position: 0, section: null,
      question: "Question 1", questionKey: KEY, hasAnswer: true, blocks: [{ label: "Say", spoken: true, text: "Answer" }],
    },
  ]);
  return { s, db, user, opportunityId };
}

function queued(opportunityId: string, over: Partial<QueuedMark> = {}): QueuedMark {
  return {
    id: "q1", userHash: "aaaa", scope: "job", opportunityId, questionKey: KEY, level: "shaky",
    markedAt: new Date(Date.now() - 3600_000).toISOString(), drilled: false, failures: 0, ...over,
  };
}

// The real queue path: the stored mark goes through drainQueue and the real server action.
async function replay(mark: QueuedMark) {
  const store = createMemoryStore([mark]);
  const result = await drainQueue({
    userHash: mark.userHash,
    load: () => store.all(),
    send: (m) => sendQueuedMark(m, markQuestionAction),
    apply: (a) => persistAction(store, a),
  });
  return { result, left: await store.all() };
}

describe("replaying an offline mark", () => {
  it("an offline mark replayed after a newer mark made on the desktop does not override it", async () => {
    const { s, opportunityId } = await setup("replay-a@example.com");
    const offlineAt = new Date(Date.now() - 3600_000).toISOString();
    const desktop = await markQuestionAction({ opportunityId, scope: "job", questionKey: KEY, level: "solid", markedAt: new Date().toISOString(), drilled: false });
    expect(desktop.ok).toBe(true);

    const { result, left } = await replay(queued(opportunityId, { level: "shaky", markedAt: offlineAt }));
    expect(result).toEqual({ sent: 1, remaining: 0 }); // settled, so it leaves the queue
    expect(left).toEqual([]);
    const row = (await s.prepMark.listForJob(opportunityId))[0];
    expect(row.level).toBe("solid");
    expect(row.markedAt.getTime()).toBeGreaterThan(Date.parse(offlineAt));
  });

  it("an offline mark replayed on an empty slot applies with its own markedAt", async () => {
    const { s, opportunityId } = await setup("replay-b@example.com");
    const markedAt = "2026-11-21T09:15:00.000Z";
    const { result } = await replay(queued(opportunityId, { level: "okay", markedAt, drilled: true }));
    expect(result.sent).toBe(1);
    const row = (await s.prepMark.listForJob(opportunityId))[0];
    expect(row).toMatchObject({ level: "okay", questionKey: KEY });
    expect(row.markedAt.toISOString()).toBe(markedAt);
    expect(row.drillCount).toBe(1);
  });

  it("a replay for a deleted job is not_found and the client discards it", async () => {
    const { s, db, opportunityId } = await setup("replay-c@example.com");
    // There is no scoped delete yet; remove the row the way a cascade would.
    await db.delete(schema.opportunity).where(eq(schema.opportunity.id, opportunityId));
    expect(await s.opportunity.getById(opportunityId)).toBeNull();
    const { result, left } = await replay(queued(opportunityId));
    expect(result).toEqual({ sent: 0, remaining: 0 });
    expect(left).toEqual([]);
  });

  it("a replay for another user's job is refused and discarded, and writes nothing", async () => {
    const mine = await setup("replay-d@example.com");
    const otherUser = await createTestUser(mine.db, "replay-e@example.com");
    harness.userId = otherUser.id;
    const { result, left } = await replay(queued(mine.opportunityId));
    expect(result.sent).toBe(0);
    expect(left).toEqual([]);
    expect(await mine.s.prepMark.listForJob(mine.opportunityId)).toEqual([]);
  });
});
