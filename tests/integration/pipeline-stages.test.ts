import { describe, expect, it } from "vitest";
import { makeTestDb, createTestUser } from "../helpers/db";
import { scoped } from "@/lib/db/scoped";
import { seedOpportunity, stageIdsByKind, FIXTURE_NOW } from "../helpers/opportunity-fixture";
import {
  addStage,
  renameStage,
  reorderStages,
  skipStage,
  unskipStage,
  removeStage,
} from "@/lib/pipeline/stages";
import { closeOpportunity } from "@/lib/pipeline/close";
import { moveOpportunity } from "@/lib/pipeline/move";
import { expectOk, expectFail } from "../helpers/result";

describe("addStage", () => {
  it("inserts a new stage and keeps positions 0..n with no gaps", async () => {
    const { db, close } = await makeTestDb();
    try {
      const user = await createTestUser(db, "owner@example.com");
      const s = scoped(db, user.id);
      const { id } = await seedOpportunity(s);
      const result = expectOk(await addStage(s, id, "portfolio_case", "Take-home"));
      const stages = await s.stage.listForOpportunity(id);
      expect(stages).toHaveLength(8);
      expect(stages.map((st) => st.position)).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
      expect(stages.find((st) => st.id === result.stageId)?.label).toBe("Take-home");
      // Positions alone are contiguous "for free" here because the new row is
      // inserted at the tail (position 7) before renumber runs, so a broken
      // or missing renumber call would still leave 0..7 with no gaps. Assert
      // the actual ORDER too: planAddStage places a same-kind stage right
      // after the last existing one of that kind, so the new portfolio_case
      // belongs at index 5, ahead of panel_final and offer. Only a real
      // renumber call moves it there from the tail it was inserted at.
      expect(stages.map((st) => st.kind)).toEqual([
        "saved",
        "applied",
        "recruiter_screen",
        "hiring_manager",
        "portfolio_case",
        "portfolio_case",
        "panel_final",
        "offer",
      ]);
      expect(stages[5]?.id).toBe(result.stageId);
    } finally {
      await close();
    }
  });

  it("rejects adding Saved, Applied or Offer again, a blank label, or editing a closed job", async () => {
    const { db, close } = await makeTestDb();
    try {
      const user = await createTestUser(db, "owner2@example.com");
      const s = scoped(db, user.id);
      const { id } = await seedOpportunity(s);
      expectFail(await addStage(s, id, "saved", "Extra"), "fixed_stage");
      expectFail(await addStage(s, id, "portfolio_case", "  "), "label_required");
      await closeOpportunity(s, id, "withdrawn", FIXTURE_NOW);
      expectFail(await addStage(s, id, "portfolio_case", "Take-home"), "closed");
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
      expectFail(await addStage(b, id, "portfolio_case", "Take-home"), "not_found");
    } finally {
      await close();
    }
  });
});

describe("renameStage", () => {
  it("renames any stage, including a fixed one", async () => {
    const { db, close } = await makeTestDb();
    try {
      const user = await createTestUser(db, "owner3@example.com");
      const s = scoped(db, user.id);
      const { id } = await seedOpportunity(s);
      const byKind = await stageIdsByKind(s, id);
      expectOk(await renameStage(s, id, byKind.saved, "Long-listed"));
      const stages = await s.stage.listForOpportunity(id);
      expect(stages.find((st) => st.id === byKind.saved)?.label).toBe("Long-listed");
    } finally {
      await close();
    }
  });

  it("rejects an unknown stage, a blank label, and editing a closed job", async () => {
    const { db, close } = await makeTestDb();
    try {
      const user = await createTestUser(db, "owner4@example.com");
      const s = scoped(db, user.id);
      const { id } = await seedOpportunity(s);
      const byKind = await stageIdsByKind(s, id);
      expectFail(await renameStage(s, id, "00000000-0000-0000-0000-000000000000", "X"), "not_found");
      expectFail(await renameStage(s, id, byKind.saved, "   "), "label_required");
      await closeOpportunity(s, id, "withdrawn", FIXTURE_NOW);
      expectFail(await renameStage(s, id, byKind.saved, "X"), "closed");
    } finally {
      await close();
    }
  });
});

describe("reorderStages", () => {
  it("accepts a valid permutation and rejects an invalid one", async () => {
    const { db, close } = await makeTestDb();
    try {
      const user = await createTestUser(db, "owner5@example.com");
      const s = scoped(db, user.id);
      const { id } = await seedOpportunity(s);
      const byKind = await stageIdsByKind(s, id);
      const swapped = [
        byKind.saved,
        byKind.applied,
        byKind.hiring_manager,
        byKind.recruiter_screen,
        byKind.portfolio_case,
        byKind.panel_final,
        byKind.offer,
      ];
      expectOk(await reorderStages(s, id, swapped));
      const stages = await s.stage.listForOpportunity(id);
      expect(stages.map((st) => st.id)).toEqual(swapped);

      const invalid = [...swapped].reverse();
      expectFail(await reorderStages(s, id, invalid), "invalid_order");
    } finally {
      await close();
    }
  });
});

describe("skipStage and unskipStage", () => {
  it("skips an upcoming non-current stage and unskips it back to upcoming", async () => {
    const { db, close } = await makeTestDb();
    try {
      const user = await createTestUser(db, "owner6@example.com");
      const s = scoped(db, user.id);
      const { id } = await seedOpportunity(s);
      const byKind = await stageIdsByKind(s, id);
      expectOk(await skipStage(s, id, byKind.recruiter_screen));
      let stages = await s.stage.listForOpportunity(id);
      expect(stages.find((st) => st.id === byKind.recruiter_screen)?.status).toBe("skipped");

      expectOk(await unskipStage(s, id, byKind.recruiter_screen, FIXTURE_NOW));
      stages = await s.stage.listForOpportunity(id);
      expect(stages.find((st) => st.id === byKind.recruiter_screen)?.status).toBe("upcoming");
    } finally {
      await close();
    }
  });

  it("rejects skipping the current stage and unskipping a stage that is not skipped", async () => {
    const { db, close } = await makeTestDb();
    try {
      const user = await createTestUser(db, "owner7@example.com");
      const s = scoped(db, user.id);
      const { id } = await seedOpportunity(s);
      const byKind = await stageIdsByKind(s, id);
      expectFail(await skipStage(s, id, byKind.saved), "stage_current");
      expectFail(await unskipStage(s, id, byKind.applied, FIXTURE_NOW), "not_skipped");
    } finally {
      await close();
    }
  });
});

describe("removeStage", () => {
  it("removes a flexible, non-current, non-done stage and leaves positions 0..n with no gaps", async () => {
    const { db, close } = await makeTestDb();
    try {
      const user = await createTestUser(db, "owner8@example.com");
      const s = scoped(db, user.id);
      const { id } = await seedOpportunity(s);
      const byKind = await stageIdsByKind(s, id);
      expectOk(await removeStage(s, id, byKind.panel_final));
      const stages = await s.stage.listForOpportunity(id);
      expect(stages).toHaveLength(6);
      expect(stages.map((st) => st.position)).toEqual([0, 1, 2, 3, 4, 5]);
      expect(stages.some((st) => st.kind === "panel_final")).toBe(false);
    } finally {
      await close();
    }
  });

  it("rejects removing Saved, Applied, Offer, or the current stage", async () => {
    const { db, close } = await makeTestDb();
    try {
      const user = await createTestUser(db, "owner9@example.com");
      const s = scoped(db, user.id);
      const { id } = await seedOpportunity(s);
      const byKind = await stageIdsByKind(s, id);
      expectFail(await removeStage(s, id, byKind.saved), "fixed_stage");
      expectFail(await removeStage(s, id, byKind.applied), "fixed_stage");
      expectFail(await removeStage(s, id, byKind.offer), "fixed_stage");

      // Saved is both fixed and current; fixed_stage wins (planRemove checks
      // it first). Move on to a flexible stage so stage_current can be
      // tested on its own, with a kind that is neither fixed nor already
      // current.
      await moveOpportunity(s, id, { kind: "recruiter_screen" }, FIXTURE_NOW);
      expectFail(await removeStage(s, id, byKind.recruiter_screen), "stage_current");
    } finally {
      await close();
    }
  });
});
