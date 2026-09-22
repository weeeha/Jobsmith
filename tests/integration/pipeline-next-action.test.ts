import { describe, expect, it } from "vitest";
import { makeTestDb, createTestUser } from "../helpers/db";
import { scoped } from "@/lib/db/scoped";
import { seedOpportunity, FIXTURE_NOW } from "../helpers/opportunity-fixture";
import { setNextAction, completeNextAction } from "@/lib/pipeline/next-action";
import { expectOk, expectFail } from "../helpers/result";

describe("setNextAction", () => {
  it("sets the text and date", async () => {
    const { db, close } = await makeTestDb();
    try {
      const user = await createTestUser(db, "owner@example.com");
      const s = scoped(db, user.id);
      const { id } = await seedOpportunity(s);
      const at = new Date("2026-09-25T09:00:00.000Z");
      expectOk(await setNextAction(s, id, { text: "Follow up with recruiter", at }));
      const opportunity = await s.opportunity.getById(id);
      expect(opportunity?.nextAction).toBe("Follow up with recruiter");
      expect(opportunity?.nextActionAt).toEqual(at);
    } finally {
      await close();
    }
  });

  it("accepts a null date", async () => {
    const { db, close } = await makeTestDb();
    try {
      const user = await createTestUser(db, "owner2@example.com");
      const s = scoped(db, user.id);
      const { id } = await seedOpportunity(s);
      expectOk(await setNextAction(s, id, { text: "Apply", at: null }));
      const opportunity = await s.opportunity.getById(id);
      expect(opportunity?.nextActionAt).toBeNull();
    } finally {
      await close();
    }
  });

  it("rejects a blank text and an unknown or wrong-tenant opportunity", async () => {
    const { db, close } = await makeTestDb();
    try {
      const alice = await createTestUser(db, "alice@example.com");
      const bob = await createTestUser(db, "bob@example.com");
      const a = scoped(db, alice.id);
      const b = scoped(db, bob.id);
      const { id } = await seedOpportunity(a);
      expectFail(await setNextAction(a, id, { text: "   ", at: null }), "invalid");
      expectFail(await setNextAction(b, id, { text: "Apply", at: null }), "not_found");
    } finally {
      await close();
    }
  });
});

describe("completeNextAction", () => {
  it("writes next_action_done with the text in body, then clears both columns", async () => {
    const { db, close } = await makeTestDb();
    try {
      const user = await createTestUser(db, "owner3@example.com");
      const s = scoped(db, user.id);
      const { id } = await seedOpportunity(s);
      await setNextAction(s, id, { text: "Follow up", at: null });
      const before = await s.event.listForOpportunity(id);

      expectOk(await completeNextAction(s, id, FIXTURE_NOW));

      const opportunity = await s.opportunity.getById(id);
      expect(opportunity?.nextAction).toBeNull();
      expect(opportunity?.nextActionAt).toBeNull();

      const after = await s.event.listForOpportunity(id);
      expect(after).toHaveLength(before.length + 1);
      expect(after[0].kind).toBe("next_action_done");
      expect(after[0].body).toBe("Follow up");
    } finally {
      await close();
    }
  });

  it("rejects completing when there is nothing to complete, and on a wrong-tenant opportunity", async () => {
    const { db, close } = await makeTestDb();
    try {
      const alice = await createTestUser(db, "alice2@example.com");
      const bob = await createTestUser(db, "bob2@example.com");
      const a = scoped(db, alice.id);
      const b = scoped(db, bob.id);
      const { id } = await seedOpportunity(a);
      expectFail(await completeNextAction(a, id, FIXTURE_NOW), "nothing_to_complete");
      expectFail(await completeNextAction(b, id, FIXTURE_NOW), "not_found");
    } finally {
      await close();
    }
  });
});
