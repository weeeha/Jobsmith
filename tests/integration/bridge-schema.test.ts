import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { makeTestDb, createTestUser } from "../helpers/db";
import * as schema from "@/lib/db/schema";

async function seedJob(db: Awaited<ReturnType<typeof makeTestDb>>["db"], userId: string) {
  const [company] = await db
    .insert(schema.company)
    .values({ userId, name: "Northwind Labs", nameKey: "northwindlabs" })
    .returning();
  const [opportunity] = await db
    .insert(schema.opportunity)
    .values({ userId, companyId: company.id, slug: "northwind-designer", roleTitle: "Designer" })
    .returning();
  const [stageRow] = await db
    .insert(schema.stage)
    .values({ userId, opportunityId: opportunity.id, kind: "hiring_manager", label: "Hiring manager", position: 0 })
    .returning();
  return { company, opportunity, stage: stageRow };
}

const ARTIFACT_BASE = {
  kind: "call_card" as const,
  title: "Call card",
  bodyMd: "# Call card",
  contentHash: "hash-1",
  origin: "pushed" as const,
};

describe("bridge schema", () => {
  it("creates the artifact and api_token tables", async () => {
    const { db, close } = await makeTestDb();
    try {
      await expect(db.select().from(schema.artifact)).resolves.toEqual([]);
      await expect(db.select().from(schema.apiToken)).resolves.toEqual([]);
    } finally {
      await close();
    }
  });

  it("rejects a bad value for every check constraint", async () => {
    const { db, client, close } = await makeTestDb();
    try {
      const alice = await createTestUser(db, "alice@example.com");
      const { opportunity, stage: stageRow } = await seedJob(db, alice.id);
      const [jobScoped] = await db
        .insert(schema.artifact)
        .values({ ...ARTIFACT_BASE, userId: alice.id, opportunityId: opportunity.id, key: "call-card", version: 1 })
        .returning();
      const [companyScoped] = await db
        .insert(schema.artifact)
        .values({ ...ARTIFACT_BASE, kind: "research", userId: alice.id, companyId: opportunity.companyId, key: "recon", version: 1 })
        .returning();

      const cases: { name: string; sql: string; params: unknown[] }[] = [
        { name: "kind", sql: `update artifact set kind = 'bogus' where id = $1`, params: [jobScoped.id] },
        { name: "origin", sql: `update artifact set origin = 'bogus' where id = $1`, params: [jobScoped.id] },
        { name: "version below 1", sql: `update artifact set version = 0 where id = $1`, params: [jobScoped.id] },
        { name: "both scopes set", sql: `update artifact set company_id = $2 where id = $1`, params: [jobScoped.id, opportunity.companyId] },
        { name: "neither scope set", sql: `update artifact set opportunity_id = null where id = $1`, params: [jobScoped.id] },
        { name: "a stage on a company-scoped row", sql: `update artifact set stage_id = $2 where id = $1`, params: [companyScoped.id, stageRow.id] },
      ];

      for (const c of cases) {
        await expect(client.query(c.sql, c.params)).rejects.toThrow();
      }
    } finally {
      await close();
    }
  });

  it("each partial unique index rejects a duplicate while the same key and version elsewhere is allowed", async () => {
    const { db, close } = await makeTestDb();
    try {
      const alice = await createTestUser(db, "alice2@example.com");
      const { opportunity } = await seedJob(db, alice.id);
      const [secondOpportunity] = await db
        .insert(schema.opportunity)
        .values({ userId: alice.id, companyId: opportunity.companyId, slug: "northwind-lead", roleTitle: "Lead" })
        .returning();

      await db.insert(schema.artifact).values({ ...ARTIFACT_BASE, userId: alice.id, opportunityId: opportunity.id, key: "call-card", version: 1 });

      // Same key and version under company scope: allowed (different partial index).
      await expect(
        db.insert(schema.artifact).values({ ...ARTIFACT_BASE, kind: "research", userId: alice.id, companyId: opportunity.companyId, key: "call-card", version: 1 }),
      ).resolves.not.toThrow();

      // Same key and version under a different opportunity: allowed.
      await expect(
        db.insert(schema.artifact).values({ ...ARTIFACT_BASE, userId: alice.id, opportunityId: secondOpportunity.id, key: "call-card", version: 1 }),
      ).resolves.not.toThrow();

      // Same key and version under the SAME opportunity: rejected.
      // The specific constraint name lives on the underlying Postgres error
      // (drizzle-orm wraps every query failure in a DrizzleQueryError whose
      // own message is just "Failed query: ..."), so this checks rejection
      // the same way tests/integration/pipeline-schema.test.ts already does
      // for every insert-path constraint violation, not a message match.
      await expect(
        db.insert(schema.artifact).values({ ...ARTIFACT_BASE, userId: alice.id, opportunityId: opportunity.id, key: "call-card", version: 1 }),
      ).rejects.toThrow();

      await db.insert(schema.artifact).values({ ...ARTIFACT_BASE, kind: "research", userId: alice.id, companyId: opportunity.companyId, key: "recon", version: 1 });
      await expect(
        db.insert(schema.artifact).values({ ...ARTIFACT_BASE, kind: "research", userId: alice.id, companyId: opportunity.companyId, key: "recon", version: 1 }),
      ).rejects.toThrow();
    } finally {
      await close();
    }
  });

  it("rejects a cross-user artifact through both composite foreign keys", async () => {
    const { db, close } = await makeTestDb();
    try {
      const alice = await createTestUser(db, "alice3@example.com");
      const bob = await createTestUser(db, "bob@example.com");
      const { opportunity } = await seedJob(db, alice.id);

      // Same reasoning as above: drizzle-orm's own DrizzleQueryError message
      // never contains the underlying constraint name, so this checks
      // rejection rather than message content.
      await expect(
        db.insert(schema.artifact).values({ ...ARTIFACT_BASE, userId: bob.id, opportunityId: opportunity.id, key: "x", version: 1 }),
      ).rejects.toThrow();

      await expect(
        db.insert(schema.artifact).values({ ...ARTIFACT_BASE, kind: "research", userId: bob.id, companyId: opportunity.companyId, key: "x", version: 1 }),
      ).rejects.toThrow();
    } finally {
      await close();
    }
  });

  it("nulls stage_id on every version when the stage is deleted", async () => {
    const { db, close } = await makeTestDb();
    try {
      const alice = await createTestUser(db, "alice4@example.com");
      const { opportunity, stage: stageRow } = await seedJob(db, alice.id);

      await db.insert(schema.artifact).values({ ...ARTIFACT_BASE, userId: alice.id, opportunityId: opportunity.id, key: "call-card", version: 1, stageId: stageRow.id });
      await db.insert(schema.artifact).values({ ...ARTIFACT_BASE, userId: alice.id, opportunityId: opportunity.id, key: "call-card", version: 2, stageId: stageRow.id });

      await db.delete(schema.stage).where(eq(schema.stage.id, stageRow.id));

      const rows = await db.select().from(schema.artifact).where(eq(schema.artifact.key, "call-card"));
      expect(rows).toHaveLength(2);
      expect(rows.every((r) => r.stageId === null)).toBe(true);
    } finally {
      await close();
    }
  });

  it("cascades a user delete to that user's artifacts and tokens", async () => {
    const { db, close } = await makeTestDb();
    try {
      const alice = await createTestUser(db, "alice5@example.com");
      const { opportunity } = await seedJob(db, alice.id);
      await db.insert(schema.artifact).values({ ...ARTIFACT_BASE, userId: alice.id, opportunityId: opportunity.id, key: "call-card", version: 1 });
      await db.insert(schema.apiToken).values({ userId: alice.id, name: "Laptop", tokenHash: "hash-a", prefix: "jsm_AAAA" });

      await db.delete(schema.user).where(eq(schema.user.id, alice.id));

      await expect(db.select().from(schema.artifact)).resolves.toEqual([]);
      await expect(db.select().from(schema.apiToken)).resolves.toEqual([]);
    } finally {
      await close();
    }
  });
});
