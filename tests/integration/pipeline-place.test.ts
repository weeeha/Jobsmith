import { describe, expect, it } from "vitest";
import { makeTestDb, createTestUser } from "../helpers/db";
import { scoped } from "@/lib/db/scoped";
import { seedOpportunity, stageIdsByKind } from "../helpers/opportunity-fixture";
import { placeOpportunity } from "@/lib/pipeline/place";
import { expectOk, expectFail } from "../helpers/result";

const NOW = new Date("2026-09-19T15:00:00.000Z");
const APPLIED_AT = new Date("2026-09-10T09:00:00.000Z");

describe("placeOpportunity", () => {
  it("writes no event for saved", async () => {
    const { db, close } = await makeTestDb();
    try {
      const user = await createTestUser(db, "owner@example.com");
      const s = scoped(db, user.id);
      const { id } = await seedOpportunity(s);
      const byKind = await stageIdsByKind(s, id);
      const before = await s.event.listForOpportunity(id);

      expectOk(await placeOpportunity(s, id, "saved", { appliedAt: APPLIED_AT, now: NOW }));

      const after = await s.event.listForOpportunity(id);
      expect(after).toHaveLength(before.length);
      const opportunity = await s.opportunity.getById(id);
      expect(opportunity?.currentStageId).toBe(byKind.saved);
    } finally {
      await close();
    }
  });

  it("applied with an appliedAt gives one stage_moved event whose time and the Applied stage's enteredAt equal appliedAt", async () => {
    const { db, close } = await makeTestDb();
    try {
      const user = await createTestUser(db, "owner2@example.com");
      const s = scoped(db, user.id);
      const { id } = await seedOpportunity(s);
      const byKind = await stageIdsByKind(s, id);
      const before = await s.event.listForOpportunity(id);

      expectOk(await placeOpportunity(s, id, "applied", { appliedAt: APPLIED_AT, now: NOW }));

      const after = await s.event.listForOpportunity(id);
      expect(after).toHaveLength(before.length + 1);
      // Found by kind rather than after[0]: listForOpportunity orders by
      // occurredAt desc, and this event is deliberately backdated to
      // APPLIED_AT (2026-09-10), which sorts behind the seed's own
      // "created" event (FIXTURE_NOW, 2026-09-19) — the realistic case
      // placeOpportunity exists for, recording a job that was actually
      // applied to before it was added to the tracker. A positional
      // after[0] check would depend on that ordering accident rather than
      // on the behavior this test actually names.
      const stageMoved = after.find((e) => e.kind === "stage_moved");
      expect(stageMoved).toBeDefined();
      expect(stageMoved?.occurredAt).toEqual(APPLIED_AT);

      const stages = await s.stage.listForOpportunity(id);
      const applied = stages.find((st) => st.id === byKind.applied)!;
      expect(applied.enteredAt).toEqual(APPLIED_AT);
      const opportunity = await s.opportunity.getById(id);
      expect(opportunity?.currentStageId).toBe(byKind.applied);
    } finally {
      await close();
    }
  });

  it("a farther kind gives exactly two stage_moved events, leaves Applied done with enteredAt at appliedAt, skips the stages in between, and makes the target current", async () => {
    const { db, close } = await makeTestDb();
    try {
      const user = await createTestUser(db, "owner3@example.com");
      const s = scoped(db, user.id);
      const { id } = await seedOpportunity(s);
      const byKind = await stageIdsByKind(s, id);
      const before = await s.event.listForOpportunity(id);

      expectOk(await placeOpportunity(s, id, "portfolio_case", { appliedAt: APPLIED_AT, now: NOW }));

      const after = await s.event.listForOpportunity(id);
      expect(after.filter((e) => e.kind === "stage_moved")).toHaveLength(2);
      expect(after).toHaveLength(before.length + 2);

      const stages = await s.stage.listForOpportunity(id);
      const applied = stages.find((st) => st.id === byKind.applied)!;
      expect(applied.status).toBe("done");
      expect(applied.enteredAt).toEqual(APPLIED_AT);
      expect(stages.find((st) => st.id === byKind.recruiter_screen)?.status).toBe("skipped");
      expect(stages.find((st) => st.id === byKind.hiring_manager)?.status).toBe("skipped");

      const opportunity = await s.opportunity.getById(id);
      expect(opportunity?.currentStageId).toBe(byKind.portfolio_case);
    } finally {
      await close();
    }
  });

  it("returns not_found for user B on user A's opportunity", async () => {
    const { db, close } = await makeTestDb();
    try {
      const alice = await createTestUser(db, "alice@example.com");
      const bob = await createTestUser(db, "bob@example.com");
      const a = scoped(db, alice.id);
      const b = scoped(db, bob.id);
      const { id } = await seedOpportunity(a);
      expectFail(await placeOpportunity(b, id, "applied", { appliedAt: APPLIED_AT, now: NOW }), "not_found");
    } finally {
      await close();
    }
  });
});
