import { describe, expect, it } from "vitest";
import { makeTestDb, createTestUser } from "../helpers/db";
import { scoped } from "@/lib/db/scoped";
import { seedOpportunity, stageIdsByKind, FIXTURE_NOW } from "../helpers/opportunity-fixture";
import { scheduleStage, setStageOutcome } from "@/lib/pipeline/schedule";
import { closeOpportunity } from "@/lib/pipeline/close";
import { expectOk, expectFail } from "../helpers/result";

const FUTURE = new Date("2026-10-01T09:00:00.000Z");
const PAST = new Date("2026-09-01T09:00:00.000Z");

describe("scheduleStage", () => {
  it("a future date on an upcoming stage makes it scheduled and writes interview_scheduled", async () => {
    const { db, close } = await makeTestDb();
    try {
      const user = await createTestUser(db, "owner@example.com");
      const s = scoped(db, user.id);
      const { id } = await seedOpportunity(s);
      const byKind = await stageIdsByKind(s, id);
      const before = await s.event.listForOpportunity(id);

      expectOk(
        await scheduleStage(s, id, byKind.recruiter_screen, { scheduledAt: FUTURE, format: "video" }, FIXTURE_NOW),
      );

      const stages = await s.stage.listForOpportunity(id);
      const recruiterScreen = stages.find((st) => st.id === byKind.recruiter_screen)!;
      expect(recruiterScreen.status).toBe("scheduled");
      expect(recruiterScreen.scheduledAt).toEqual(FUTURE);
      expect(recruiterScreen.format).toBe("video");

      const after = await s.event.listForOpportunity(id);
      expect(after).toHaveLength(before.length + 1);
      expect(after[0].kind).toBe("interview_scheduled");
      expect((after[0].meta as { stageLabel: string }).stageLabel).toBe(recruiterScreen.label);
    } finally {
      await close();
    }
  });

  it("a past date leaves status as it is and writes no event", async () => {
    const { db, close } = await makeTestDb();
    try {
      const user = await createTestUser(db, "owner2@example.com");
      const s = scoped(db, user.id);
      const { id } = await seedOpportunity(s);
      const byKind = await stageIdsByKind(s, id);
      const before = await s.event.listForOpportunity(id);

      expectOk(
        await scheduleStage(s, id, byKind.recruiter_screen, { scheduledAt: PAST, format: "phone" }, FIXTURE_NOW),
      );

      const stages = await s.stage.listForOpportunity(id);
      const recruiterScreen = stages.find((st) => st.id === byKind.recruiter_screen)!;
      expect(recruiterScreen.status).toBe("upcoming");
      expect(recruiterScreen.scheduledAt).toEqual(PAST);

      const after = await s.event.listForOpportunity(id);
      expect(after).toHaveLength(before.length);
    } finally {
      await close();
    }
  });

  it("clearing the date returns a scheduled stage to upcoming", async () => {
    const { db, close } = await makeTestDb();
    try {
      const user = await createTestUser(db, "owner3@example.com");
      const s = scoped(db, user.id);
      const { id } = await seedOpportunity(s);
      const byKind = await stageIdsByKind(s, id);
      await scheduleStage(s, id, byKind.recruiter_screen, { scheduledAt: FUTURE, format: "video" }, FIXTURE_NOW);

      expectOk(await scheduleStage(s, id, byKind.recruiter_screen, { scheduledAt: null, format: null }, FIXTURE_NOW));

      const stages = await s.stage.listForOpportunity(id);
      const recruiterScreen = stages.find((st) => st.id === byKind.recruiter_screen)!;
      expect(recruiterScreen.status).toBe("upcoming");
      expect(recruiterScreen.scheduledAt).toBeNull();
    } finally {
      await close();
    }
  });

  it("rejects scheduling on a closed opportunity", async () => {
    const { db, close } = await makeTestDb();
    try {
      const user = await createTestUser(db, "owner4@example.com");
      const s = scoped(db, user.id);
      const { id } = await seedOpportunity(s);
      const byKind = await stageIdsByKind(s, id);
      await closeOpportunity(s, id, "withdrawn", FIXTURE_NOW);
      expectFail(
        await scheduleStage(s, id, byKind.recruiter_screen, { scheduledAt: FUTURE, format: "video" }, FIXTURE_NOW),
        "closed",
      );
    } finally {
      await close();
    }
  });

  it("returns not_found for an unknown stage or a wrong-tenant opportunity", async () => {
    const { db, close } = await makeTestDb();
    try {
      const alice = await createTestUser(db, "alice@example.com");
      const bob = await createTestUser(db, "bob@example.com");
      const a = scoped(db, alice.id);
      const b = scoped(db, bob.id);
      const { id } = await seedOpportunity(a);
      const byKind = await stageIdsByKind(a, id);
      expectFail(
        await scheduleStage(a, id, "00000000-0000-0000-0000-000000000000", { scheduledAt: FUTURE, format: null }, FIXTURE_NOW),
        "not_found",
      );
      expectFail(
        await scheduleStage(b, id, byKind.recruiter_screen, { scheduledAt: FUTURE, format: null }, FIXTURE_NOW),
        "not_found",
      );
    } finally {
      await close();
    }
  });
});

describe("setStageOutcome", () => {
  it("sets the outcome notes on a stage of this opportunity", async () => {
    const { db, close } = await makeTestDb();
    try {
      const user = await createTestUser(db, "owner5@example.com");
      const s = scoped(db, user.id);
      const { id } = await seedOpportunity(s);
      const byKind = await stageIdsByKind(s, id);
      expectOk(await setStageOutcome(s, id, byKind.saved, "Went well, moving forward."));
      const stages = await s.stage.listForOpportunity(id);
      expect(stages.find((st) => st.id === byKind.saved)?.outcomeMd).toBe("Went well, moving forward.");
    } finally {
      await close();
    }
  });

  it("rejects a stage that belongs to a different opportunity, even one this user owns", async () => {
    const { db, close } = await makeTestDb();
    try {
      const user = await createTestUser(db, "owner6@example.com");
      const s = scoped(db, user.id);
      const first = await seedOpportunity(s, { roleTitle: "Product Designer" });
      const second = await seedOpportunity(s, { roleTitle: "Staff Designer" });
      const secondStages = await stageIdsByKind(s, second.id);
      expectFail(await setStageOutcome(s, first.id, secondStages.saved, "Wrong job"), "not_found");
    } finally {
      await close();
    }
  });
});
