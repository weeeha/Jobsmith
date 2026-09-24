import { describe, expect, it } from "vitest";
import { makeTestDb, createTestUser } from "../helpers/db";
import { scoped } from "@/lib/db/scoped";
import { parseApplications, importApplications } from "@/lib/import/applications";
import { closeOpportunity } from "@/lib/pipeline/close";
import { expectOk } from "../helpers/result";
import sample from "../fixtures/applications.sample.json";

describe("parseApplications", () => {
  it("parses the sample fixture into eight entries", () => {
    const entries = expectOk(parseApplications(sample));
    expect(entries).toHaveLength(8);
    expect(entries[0]!.stageKind).toBe("saved");
  });

  it("rejects a file that is not an array", () => {
    const result = parseApplications({ not: "an array" });
    expect(result.ok).toBe(false);
  });

  it("rejects an entry with an unknown stageKind", () => {
    const result = parseApplications([{ company: "A", roleTitle: "B", stageKind: "not_a_real_kind" }]);
    expect(result.ok).toBe(false);
  });
});

describe("importApplications", () => {
  it("creates six, skips the duplicate pair, and fails the bad-date entry by index", async () => {
    const { db, close } = await makeTestDb();
    try {
      const user = await createTestUser(db, "owner@example.com");
      const s = scoped(db, user.id);
      const entries = expectOk(parseApplications(sample));

      const summary = await importApplications(s, entries, { dryRun: false });

      expect(summary.created).toBe(6);
      expect(summary.skipped).toBe(1);
      expect(summary.failed).toEqual([{ index: 7, message: expect.any(String) }]);

      const board = await s.opportunity.listBoard();
      expect(board.map((c) => c.roleTitle).sort()).toEqual(
        [
          "Design Lead",
          "Principal Product Designer",
          "Product Design Manager",
          "Product Designer",
          "Senior Product Designer",
          "Staff Product Designer",
        ].sort(),
      );
    } finally {
      await close();
    }
  });

  it("a second run against the same fixture creates nothing", async () => {
    const { db, close } = await makeTestDb();
    try {
      const user = await createTestUser(db, "owner2@example.com");
      const s = scoped(db, user.id);
      const entries = expectOk(parseApplications(sample));

      await importApplications(s, entries, { dryRun: false });
      const second = await importApplications(s, entries, { dryRun: false });

      expect(second.created).toBe(0);
      expect(second.skipped).toBe(7);
      expect(second.failed).toHaveLength(1);
    } finally {
      await close();
    }
  });

  it("an entry whose stageKind is beyond applied lands there with exactly two stage_moved events, Applied done and the stage between skipped", async () => {
    const { db, close } = await makeTestDb();
    try {
      const user = await createTestUser(db, "owner3@example.com");
      const s = scoped(db, user.id);
      const entries = expectOk(parseApplications(sample));
      await importApplications(s, entries, { dryRun: false });

      const board = await s.opportunity.listBoard();
      const designLead = board.find((c) => c.roleTitle === "Design Lead")!;
      expect(designLead.stage.kind).toBe("hiring_manager");

      const stages = await s.stage.listForOpportunity(designLead.id);
      const applied = stages.find((st) => st.kind === "applied")!;
      const recruiterScreen = stages.find((st) => st.kind === "recruiter_screen")!;
      expect(applied.status).toBe("done");
      expect(applied.enteredAt?.toISOString().slice(0, 10)).toBe("2026-07-15");
      expect(recruiterScreen.status).toBe("skipped");

      const events = await s.event.listForOpportunity(designLead.id);
      expect(events.filter((e) => e.kind === "stage_moved")).toHaveLength(2);
    } finally {
      await close();
    }
  });

  it("appliedAt lands on the Applied stage's enteredAt, and notes become one note event", async () => {
    const { db, close } = await makeTestDb();
    try {
      const user = await createTestUser(db, "owner4@example.com");
      const s = scoped(db, user.id);
      const entries = expectOk(parseApplications(sample));
      await importApplications(s, entries, { dryRun: false });

      const board = await s.opportunity.listBoard();
      const staff = board.find((c) => c.roleTitle === "Staff Product Designer")!;
      const stages = await s.stage.listForOpportunity(staff.id);
      const applied = stages.find((st) => st.kind === "applied")!;
      expect(applied.enteredAt?.toISOString().slice(0, 10)).toBe("2026-08-01");

      const events = await s.event.listForOpportunity(staff.id);
      expect(events.filter((e) => e.kind === "note")).toHaveLength(1);
      expect(events.filter((e) => e.kind === "stage_moved")).toHaveLength(1);
    } finally {
      await close();
    }
  });

  it("sets nextAction from the entry that has one", async () => {
    const { db, close } = await makeTestDb();
    try {
      const user = await createTestUser(db, "owner5@example.com");
      const s = scoped(db, user.id);
      const entries = expectOk(parseApplications(sample));
      await importApplications(s, entries, { dryRun: false });

      const board = await s.opportunity.listBoard();
      const recruiterScreen = board.find((c) => c.companyName === "Northwind Labs" && c.roleTitle === "Product Designer")!;
      expect(recruiterScreen.nextAction).toBe("Prep for the recruiter call");
    } finally {
      await close();
    }
  });

  it("a dry run reports the same counts and writes nothing", async () => {
    const { db, close } = await makeTestDb();
    try {
      const user = await createTestUser(db, "owner6@example.com");
      const s = scoped(db, user.id);
      const entries = expectOk(parseApplications(sample));

      const summary = await importApplications(s, entries, { dryRun: true });
      const board = await s.opportunity.listBoard();

      expect(summary.created).toBe(6);
      expect(summary.skipped).toBe(1);
      expect(summary.failed).toHaveLength(1);
      expect(board).toHaveLength(0);
    } finally {
      await close();
    }
  });

  it("an entry that was imported and then closed is skipped rather than recreated, and a dry run agrees", async () => {
    const { db, close } = await makeTestDb();
    try {
      const user = await createTestUser(db, "owner7@example.com");
      const s = scoped(db, user.id);
      const entries = expectOk(parseApplications(sample));

      await importApplications(s, entries, { dryRun: false });
      const board = await s.opportunity.listBoard();
      const savedRole = board.find((c) => c.roleTitle === "Senior Product Designer")!;
      expectOk(await closeOpportunity(s, savedRole.id, "rejected"));

      const second = await importApplications(s, entries, { dryRun: false });
      expect(second.created).toBe(0);
      expect(second.skipped).toBe(7);
      expect(second.failed).toHaveLength(1);

      const dryRun = await importApplications(s, entries, { dryRun: true });
      expect(dryRun.created).toBe(0);
      expect(dryRun.skipped).toBe(7);
      expect(dryRun.failed).toHaveLength(1);
    } finally {
      await close();
    }
  });
});
