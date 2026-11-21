import { describe, expect, it } from "vitest";
import { makeTestDb, createTestUser } from "../helpers/db";
import { scoped } from "@/lib/db/scoped";
import { createOpportunity } from "@/lib/pipeline/create";
import { endSession, startSession } from "@/lib/prep/sessions";
import { eventText } from "@/lib/pipeline/event-text";
import { expectFail, expectOk } from "../helpers/result";

const T0 = new Date("2026-03-01T10:00:00Z");
const T1 = new Date("2026-03-01T10:20:00Z");

async function setup(email: string) {
  const { db, close } = await makeTestDb();
  const user = await createTestUser(db, email);
  const s = scoped(db, user.id);
  const opportunityId = expectOk(await createOpportunity(s, { companyName: "Northwind Traders", roleTitle: "Designer" })).id;
  return { db, s, close, opportunityId };
}

const drilled = async (s: ReturnType<typeof scoped>, opportunityId: string) =>
  (await s.event.listForOpportunity(opportunityId)).filter((e) => e.kind === "prep_drilled");

describe("prep sessions", () => {
  it("startSession writes a prep_session with started_at and the planned question count", async () => {
    const { s, close, opportunityId } = await setup("ps1@example.com");
    try {
      const { id } = expectOk(
        await startSession(s, { opportunityId, mode: "quick_fire", questions: 10, meta: { doc: "answers-full" }, now: T0 }),
      );
      const row = await s.prepSession.getById(id);
      expect(row).toMatchObject({ mode: "quick_fire", questions: 10, marked: 0, endedAt: null, meta: { doc: "answers-full" } });
      expect(row!.startedAt).toEqual(T0);
    } finally {
      await close();
    }
  });

  it("startSession for another user's job is not_found", async () => {
    const mine = await setup("ps2a@example.com");
    try {
      const other = scoped(mine.db, (await createTestUser(mine.db, "ps2b@example.com")).id);
      const theirs = expectOk(await createOpportunity(other, { companyName: "Contoso Goods", roleTitle: "Designer" })).id;
      expectFail(await startSession(mine.s, { opportunityId: theirs, mode: "drill", questions: 5 }), "not_found");
      expect(await other.prepSession.listForJob(theirs)).toEqual([]);
    } finally {
      await mine.close();
    }
  });

  it("endSession writes ended_at, questions seen and marked, and one prep_drilled event 'Drilled 10 questions, 4 marked solid'", async () => {
    const { s, close, opportunityId } = await setup("ps3@example.com");
    try {
      const { id } = expectOk(await startSession(s, { opportunityId, mode: "drill", questions: 12, now: T0 }));
      const result = expectOk(await endSession(s, { id, seen: 10, marked: 7, solid: 4, now: T1 }));
      expect(result).toEqual({ eventWritten: true });
      const row = await s.prepSession.getById(id);
      expect(row).toMatchObject({ questions: 10, marked: 7 });
      expect(row!.endedAt).toEqual(T1);
      const events = await drilled(s, opportunityId);
      expect(events).toHaveLength(1);
      expect(events[0].body).toBe("Drilled 10 questions, 4 marked solid");
      expect(events[0].occurredAt).toEqual(T1);
      expect(events[0].meta).toEqual({ sessionId: id, mode: "drill", seen: 10, marked: 7, solid: 4 });
      expect(eventText(events[0])).toBe("Drilled 10 questions, 4 marked solid");
    } finally {
      await close();
    }
  });

  it("the event body is singular for one question: 'Drilled 1 question, 0 marked solid'", async () => {
    const { s, close, opportunityId } = await setup("ps4@example.com");
    try {
      const { id } = expectOk(await startSession(s, { opportunityId, mode: "drill", questions: 1 }));
      expectOk(await endSession(s, { id, seen: 1, marked: 0, solid: 0 }));
      expect((await drilled(s, opportunityId))[0].body).toBe("Drilled 1 question, 0 marked solid");
    } finally {
      await close();
    }
  });

  it("a quick_fire job session also writes the event", async () => {
    const { s, close, opportunityId } = await setup("ps5@example.com");
    try {
      const { id } = expectOk(await startSession(s, { opportunityId, mode: "quick_fire", questions: 10 }));
      expect(expectOk(await endSession(s, { id, seen: 10, marked: 3, solid: 2 })).eventWritten).toBe(true);
      expect(await drilled(s, opportunityId)).toHaveLength(1);
    } finally {
      await close();
    }
  });

  it("a library session (no job) writes no event", async () => {
    const { s, close, opportunityId } = await setup("ps6@example.com");
    try {
      const { id } = expectOk(await startSession(s, { opportunityId: null, mode: "quick_fire", questions: 10 }));
      expect(expectOk(await endSession(s, { id, seen: 10, marked: 0, solid: 0 })).eventWritten).toBe(false);
      expect(await drilled(s, opportunityId)).toEqual([]);
      expect((await s.prepSession.getById(id))!.endedAt).not.toBeNull();
    } finally {
      await close();
    }
  });

  it("a listen session writes no event", async () => {
    const { s, close, opportunityId } = await setup("ps7@example.com");
    try {
      const { id } = expectOk(await startSession(s, { opportunityId, mode: "listen", questions: 30 }));
      expect(expectOk(await endSession(s, { id, seen: 30, marked: 0, solid: 0 })).eventWritten).toBe(false);
      expect(await drilled(s, opportunityId)).toEqual([]);
    } finally {
      await close();
    }
  });

  it("ending the same session twice writes one event and the second call returns eventWritten false", async () => {
    const { s, close, opportunityId } = await setup("ps8@example.com");
    try {
      const { id } = expectOk(await startSession(s, { opportunityId, mode: "drill", questions: 10, now: T0 }));
      expect(expectOk(await endSession(s, { id, seen: 10, marked: 4, solid: 4, now: T1 })).eventWritten).toBe(true);
      const again = expectOk(await endSession(s, { id, seen: 3, marked: 0, solid: 0, now: new Date("2026-03-02T00:00:00Z") }));
      expect(again.eventWritten).toBe(false);
      expect(await drilled(s, opportunityId)).toHaveLength(1);
      const row = await s.prepSession.getById(id);
      expect(row).toMatchObject({ questions: 10, marked: 4 });
      expect(row!.endedAt).toEqual(T1);
    } finally {
      await close();
    }
  });

  it("endSession for a missing or foreign session is not_found", async () => {
    const mine = await setup("ps9a@example.com");
    try {
      const other = scoped(mine.db, (await createTestUser(mine.db, "ps9b@example.com")).id);
      const theirs = expectOk(await createOpportunity(other, { companyName: "Contoso Goods", roleTitle: "Designer" })).id;
      const { id } = expectOk(await startSession(other, { opportunityId: theirs, mode: "drill", questions: 5 }));
      expectFail(await endSession(mine.s, { id, seen: 5, marked: 0, solid: 0 }), "not_found");
      expectFail(await endSession(mine.s, { id: crypto.randomUUID(), seen: 5, marked: 0, solid: 0 }), "not_found");
      expect((await other.prepSession.getById(id))!.endedAt).toBeNull();
    } finally {
      await mine.close();
    }
  });
});
