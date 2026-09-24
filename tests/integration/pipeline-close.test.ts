import { describe, expect, it } from "vitest";
import { makeTestDb, createTestUser } from "../helpers/db";
import { scoped } from "@/lib/db/scoped";
import { seedOpportunity, FIXTURE_NOW } from "../helpers/opportunity-fixture";
import { closeOpportunity, reopenOpportunity } from "@/lib/pipeline/close";
import { expectOk, expectFail } from "../helpers/result";

describe("closeOpportunity and reopenOpportunity", () => {
  it("closing sets status, reason, closed_at and closed_stage_id, and writes one event", async () => {
    const { db, close } = await makeTestDb();
    try {
      const user = await createTestUser(db, "owner@example.com");
      const s = scoped(db, user.id);
      const { id } = await seedOpportunity(s);
      const before = await s.event.listForOpportunity(id);

      expectOk(await closeOpportunity(s, id, "accepted", FIXTURE_NOW));

      const opportunity = await s.opportunity.getById(id);
      expect(opportunity?.status).toBe("closed");
      expect(opportunity?.closedReason).toBe("accepted");
      expect(opportunity?.closedAt).toEqual(FIXTURE_NOW);
      expect(opportunity?.closedStageId).toBe(opportunity?.currentStageId);

      const after = await s.event.listForOpportunity(id);
      expect(after).toHaveLength(before.length + 1);
      expect(after[0].kind).toBe("closed");
    } finally {
      await close();
    }
  });

  it("rejects closing an already-closed opportunity", async () => {
    const { db, close } = await makeTestDb();
    try {
      const user = await createTestUser(db, "owner2@example.com");
      const s = scoped(db, user.id);
      const { id } = await seedOpportunity(s);
      await closeOpportunity(s, id, "withdrawn", FIXTURE_NOW);
      expectFail(await closeOpportunity(s, id, "withdrawn", FIXTURE_NOW), "closed");
    } finally {
      await close();
    }
  });

  it("reopening round-trips the closed columns back to null and status to active", async () => {
    const { db, close } = await makeTestDb();
    try {
      const user = await createTestUser(db, "owner3@example.com");
      const s = scoped(db, user.id);
      const { id } = await seedOpportunity(s);
      await closeOpportunity(s, id, "ghosted", FIXTURE_NOW);
      const before = await s.event.listForOpportunity(id);

      expectOk(await reopenOpportunity(s, id, FIXTURE_NOW));

      const opportunity = await s.opportunity.getById(id);
      expect(opportunity?.status).toBe("active");
      expect(opportunity?.closedReason).toBeNull();
      expect(opportunity?.closedAt).toBeNull();
      expect(opportunity?.closedStageId).toBeNull();

      const after = await s.event.listForOpportunity(id);
      expect(after).toHaveLength(before.length + 1);
      expect(after[0].kind).toBe("reopened");
    } finally {
      await close();
    }
  });

  it("rejects reopening an opportunity that is not closed", async () => {
    const { db, close } = await makeTestDb();
    try {
      const user = await createTestUser(db, "owner4@example.com");
      const s = scoped(db, user.id);
      const { id } = await seedOpportunity(s);
      expectFail(await reopenOpportunity(s, id, FIXTURE_NOW), "not_closed");
    } finally {
      await close();
    }
  });

  it("returns not_found for both functions on an unknown or another user's opportunity", async () => {
    const { db, close } = await makeTestDb();
    try {
      const alice = await createTestUser(db, "alice@example.com");
      const bob = await createTestUser(db, "bob@example.com");
      const a = scoped(db, alice.id);
      const b = scoped(db, bob.id);
      const { id } = await seedOpportunity(a);
      expectFail(await closeOpportunity(b, id, "withdrawn", FIXTURE_NOW), "not_found");
      expectFail(await reopenOpportunity(b, id, FIXTURE_NOW), "not_found");
    } finally {
      await close();
    }
  });
});
