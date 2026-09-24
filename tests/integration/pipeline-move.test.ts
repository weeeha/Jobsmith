import { describe, expect, it } from "vitest";
import { makeTestDb, createTestUser } from "../helpers/db";
import { scoped } from "@/lib/db/scoped";
import { seedOpportunity, stageIdsByKind, FIXTURE_NOW } from "../helpers/opportunity-fixture";
import { moveOpportunity } from "@/lib/pipeline/move";
import { expectOk, expectFail } from "../helpers/result";

describe("moveOpportunity", () => {
  it("moves forward, writes exactly one event, and keeps positions 0..n with no gaps", async () => {
    const { db, close } = await makeTestDb();
    try {
      const user = await createTestUser(db, "owner@example.com");
      const s = scoped(db, user.id);
      const { id } = await seedOpportunity(s);
      const before = await s.event.listForOpportunity(id);

      const moved = expectOk(await moveOpportunity(s, id, { kind: "applied" }, FIXTURE_NOW));
      expect(moved.to.kind).toBe("applied");

      const after = await s.event.listForOpportunity(id);
      expect(after).toHaveLength(before.length + 1);
      expect(after[0].kind).toBe("stage_moved");

      const opportunity = await s.opportunity.getById(id);
      const stages = await s.stage.listForOpportunity(id);
      const applied = stages.find((st) => st.kind === "applied")!;
      expect(opportunity?.currentStageId).toBe(applied.id);
      expect(stages.map((st) => st.position)).toEqual([0, 1, 2, 3, 4, 5, 6]);
    } finally {
      await close();
    }
  });

  it("moves backward and returns skipped stages between to upcoming", async () => {
    const { db, close } = await makeTestDb();
    try {
      const user = await createTestUser(db, "owner2@example.com");
      const s = scoped(db, user.id);
      const { id } = await seedOpportunity(s);
      await moveOpportunity(s, id, { kind: "hiring_manager" }, FIXTURE_NOW);

      const before = await s.event.listForOpportunity(id);
      const moved = expectOk(await moveOpportunity(s, id, { kind: "applied" }, FIXTURE_NOW));
      expect(moved.to.kind).toBe("applied");
      const after = await s.event.listForOpportunity(id);
      expect(after).toHaveLength(before.length + 1);

      const stages = await s.stage.listForOpportunity(id);
      const recruiterScreen = stages.find((st) => st.kind === "recruiter_screen")!;
      expect(recruiterScreen.status).toBe("upcoming");
    } finally {
      await close();
    }
  });

  it("moves to a missing kind, creating the stage before Offer with no position gaps", async () => {
    const { db, close } = await makeTestDb();
    try {
      const user = await createTestUser(db, "owner3@example.com");
      const s = scoped(db, user.id);
      const { id } = await seedOpportunity(s);
      await moveOpportunity(s, id, { kind: "hiring_manager" }, FIXTURE_NOW);
      const before = await s.stage.listForOpportunity(id);
      expect(before).toHaveLength(7);

      // Remove portfolio_case and panel_final directly through the scoped
      // stage primitive, not the pipeline-level removeStage: this test's
      // own use of moveOpportunity below should not depend on removeStage
      // living in another file too. This leaves gaps in `position`, which
      // is fine: planMove and stage.renumber both work off array order, not
      // raw position values, and the move below ends by renumbering the
      // whole opportunity anyway.
      const byKind = await stageIdsByKind(s, id);
      await s.stage.remove(byKind.panel_final);
      await s.stage.remove(byKind.portfolio_case);

      const beforeMove = await s.event.listForOpportunity(id);
      const moved = expectOk(await moveOpportunity(s, id, { kind: "portfolio_case" }, FIXTURE_NOW));
      expect(moved.to.kind).toBe("portfolio_case");
      const afterMove = await s.event.listForOpportunity(id);
      expect(afterMove).toHaveLength(beforeMove.length + 1);

      const stages = await s.stage.listForOpportunity(id);
      expect(stages).toHaveLength(6);
      expect(stages.map((st) => st.kind)).toEqual([
        "saved",
        "applied",
        "recruiter_screen",
        "hiring_manager",
        "portfolio_case",
        "offer",
      ]);
      expect(stages.map((st) => st.position)).toEqual([0, 1, 2, 3, 4, 5]);
    } finally {
      await close();
    }
  });

  it("rejects a move on a closed opportunity", async () => {
    const { db, close } = await makeTestDb();
    try {
      const user = await createTestUser(db, "owner4@example.com");
      const s = scoped(db, user.id);
      const { id } = await seedOpportunity(s);
      await s.opportunity.update(id, { status: "closed", closedReason: "withdrawn", closedAt: FIXTURE_NOW });
      expectFail(await moveOpportunity(s, id, { kind: "applied" }, FIXTURE_NOW), "closed");
    } finally {
      await close();
    }
  });

  it("rejects same_stage, same_column and not_found the same way the rules do", async () => {
    const { db, close } = await makeTestDb();
    try {
      const user = await createTestUser(db, "owner5@example.com");
      const s = scoped(db, user.id);
      const { id } = await seedOpportunity(s);
      const byKind = await stageIdsByKind(s, id);
      expectFail(await moveOpportunity(s, id, { stageId: byKind.saved }, FIXTURE_NOW), "same_stage");
      expectFail(await moveOpportunity(s, id, { kind: "saved" }, FIXTURE_NOW), "same_column");
      expectFail(await moveOpportunity(s, id, { stageId: "00000000-0000-0000-0000-000000000000" }, FIXTURE_NOW), "not_found");
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
      expectFail(await moveOpportunity(b, id, { kind: "applied" }, FIXTURE_NOW), "not_found");
    } finally {
      await close();
    }
  });
});
