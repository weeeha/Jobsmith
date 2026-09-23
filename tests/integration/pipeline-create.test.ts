import { describe, expect, it } from "vitest";
import { makeTestDb, createTestUser } from "../helpers/db";
import { scoped } from "@/lib/db/scoped";
import { createOpportunity } from "@/lib/pipeline/create";
import { expectOk, expectFail } from "../helpers/result";

const NOW = new Date("2026-09-19T12:00:00.000Z");

describe("createOpportunity", () => {
  it("creates seven default stages with Saved current and writes one created event", async () => {
    const { db, close } = await makeTestDb();
    try {
      const user = await createTestUser(db, "owner@example.com");
      const s = scoped(db, user.id);
      const created = expectOk(
        await createOpportunity(s, { companyName: "Acme Robotics", roleTitle: "Product Designer" }, NOW),
      );

      const stages = await s.stage.listForOpportunity(created.id);
      expect(stages.map((st) => st.kind)).toEqual([
        "saved",
        "applied",
        "recruiter_screen",
        "hiring_manager",
        "portfolio_case",
        "panel_final",
        "offer",
      ]);
      expect(stages.map((st) => st.position)).toEqual([0, 1, 2, 3, 4, 5, 6]);

      const opportunity = await s.opportunity.getById(created.id);
      const savedStage = stages.find((st) => st.kind === "saved")!;
      expect(opportunity?.currentStageId).toBe(savedStage.id);
      expect(savedStage.enteredAt).toEqual(NOW);

      const events = await s.event.listForOpportunity(created.id);
      expect(events).toHaveLength(1);
      expect(events[0].kind).toBe("created");
    } finally {
      await close();
    }
  });

  it("gives the second job with the same company and role a unique slug", async () => {
    const { db, close } = await makeTestDb();
    try {
      const user = await createTestUser(db, "owner2@example.com");
      const s = scoped(db, user.id);
      const first = expectOk(
        await createOpportunity(s, { companyName: "Acme Robotics", roleTitle: "Product Designer" }, NOW),
      );
      await s.opportunity.update(first.id, { status: "closed", closedReason: "withdrawn", closedAt: NOW });
      const second = expectOk(
        await createOpportunity(s, { companyName: "Acme Robotics", roleTitle: "Product Designer" }, NOW),
      );
      expect(second.slug).not.toBe(first.slug);
      expect(second.slug.startsWith(first.slug)).toBe(true);
    } finally {
      await close();
    }
  });

  it("rejects a duplicate company and role while the first is still active", async () => {
    const { db, close } = await makeTestDb();
    try {
      const user = await createTestUser(db, "owner3@example.com");
      const s = scoped(db, user.id);
      await createOpportunity(s, { companyName: "Acme Robotics", roleTitle: "Product Designer" }, NOW);
      const second = await createOpportunity(
        s,
        { companyName: "Acme Robotics", roleTitle: "Product Designer" },
        NOW,
      );
      expectFail(second, "duplicate");
    } finally {
      await close();
    }
  });

  it("allows a repeat application once the first is closed", async () => {
    const { db, close } = await makeTestDb();
    try {
      const user = await createTestUser(db, "owner4@example.com");
      const s = scoped(db, user.id);
      const first = expectOk(
        await createOpportunity(s, { companyName: "Acme Robotics", roleTitle: "Product Designer" }, NOW),
      );
      await s.opportunity.update(first.id, { status: "closed", closedReason: "rejected", closedAt: NOW });
      const second = await createOpportunity(
        s,
        { companyName: "Acme Robotics", roleTitle: "Product Designer" },
        NOW,
      );
      expect(second.ok).toBe(true);
    } finally {
      await close();
    }
  });

  it("rejects invalid input", async () => {
    const { db, close } = await makeTestDb();
    try {
      const user = await createTestUser(db, "owner5@example.com");
      const s = scoped(db, user.id);
      expectFail(await createOpportunity(s, { companyName: "  ", roleTitle: "Designer" }, NOW), "invalid");
      expectFail(
        await createOpportunity(
          s,
          { companyName: "Acme", roleTitle: "Designer", compMin: 200000, compMax: 100000 },
          NOW,
        ),
        "invalid",
      );
      expectFail(
        await createOpportunity(
          s,
          { companyName: "Acme", roleTitle: "Designer", sourceUrl: "ftp://acme.example" },
          NOW,
        ),
        "invalid",
      );
    } finally {
      await close();
    }
  });

  // I3: comp_min/comp_max are Postgres `integer` columns (max
  // 2,147,483,647). 3,000,000,000 is a valid JS safe integer, so without a
  // matching Zod bound this reached the insert and Postgres itself threw -
  // this proves it now comes back as an ordinary `invalid` result instead.
  it("rejects a pay figure above Postgres's integer maximum without throwing", async () => {
    const { db, close } = await makeTestDb();
    try {
      const user = await createTestUser(db, "owner-overflow@example.com");
      const s = scoped(db, user.id);
      expectFail(
        await createOpportunity(s, { companyName: "Acme", roleTitle: "Designer", compMax: 3_000_000_000 }, NOW),
        "invalid",
      );
    } finally {
      await close();
    }
  });

  it("keeps two users' companies and opportunities from colliding", async () => {
    const { db, close } = await makeTestDb();
    try {
      const alice = await createTestUser(db, "alice@example.com");
      const bob = await createTestUser(db, "bob@example.com");
      const a = scoped(db, alice.id);
      const b = scoped(db, bob.id);
      const aliceCreated = expectOk(
        await createOpportunity(a, { companyName: "Acme Robotics", roleTitle: "Product Designer" }, NOW),
      );
      expect(await b.opportunity.getBySlug(aliceCreated.slug)).toBeNull();
      const bobCreated = expectOk(
        await createOpportunity(b, { companyName: "Acme Robotics", roleTitle: "Product Designer" }, NOW),
      );
      expect(bobCreated.id).not.toBe(aliceCreated.id);
    } finally {
      await close();
    }
  });

  it("does not let underscore or percent in a role title act as a wildcard, but still matches case-insensitively", async () => {
    const { db, close } = await makeTestDb();
    try {
      const user = await createTestUser(db, "owner6@example.com");
      const s = scoped(db, user.id);
      await createOpportunity(s, { companyName: "Acme Robotics", roleTitle: "UX-UI Designer" }, NOW);
      const notAWildcardMatch = await createOpportunity(
        s,
        { companyName: "Acme Robotics", roleTitle: "UX_UI Designer" },
        NOW,
      );
      expect(notAWildcardMatch.ok).toBe(true);

      await createOpportunity(s, { companyName: "Northwind Labs", roleTitle: "Product Designer" }, NOW);
      const caseInsensitiveMatch = await createOpportunity(
        s,
        { companyName: "Northwind Labs", roleTitle: "product designer" },
        NOW,
      );
      expectFail(caseInsensitiveMatch, "duplicate");
    } finally {
      await close();
    }
  });
});
