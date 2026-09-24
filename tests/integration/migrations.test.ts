import { describe, expect, it } from "vitest";
import { makeTestDb, createTestUser } from "../helpers/db";
import * as schema from "@/lib/db/schema";

describe("migrations", () => {
  it("apply cleanly on PGlite and create every expected table", async () => {
    const { db, close } = await makeTestDb();
    try {
      await expect(db.select().from(schema.user)).resolves.toEqual([]);
      await expect(db.select().from(schema.session)).resolves.toEqual([]);
      await expect(db.select().from(schema.account)).resolves.toEqual([]);
      await expect(db.select().from(schema.verification)).resolves.toEqual([]);
      await expect(db.select().from(schema.profile)).resolves.toEqual([]);
      await expect(db.select().from(schema.rateLimit)).resolves.toEqual([]);
    } finally {
      await close();
    }
  });

  it("creates a test user through the shared helper", async () => {
    const { db, close } = await makeTestDb();
    try {
      const user = await createTestUser(db, "reviewer@example.com");
      expect(user.email).toBe("reviewer@example.com");
    } finally {
      await close();
    }
  });

  it("stores every timestamp column with time zone", async () => {
    // node-postgres and Postgres both silently drop the UTC offset from a
    // "timestamp without time zone" column, so every timestamp in this
    // schema must carry a time zone. Queried through the same PGlite
    // database the other tests in this file migrate, not the schema
    // source, so this fails if a future column forgets withTimezone even
    // though the TypeScript source looks fine.
    const { client, close } = await makeTestDb();
    try {
      const { rows } = await client.query<{ table_name: string; column_name: string }>(
        `SELECT table_name, column_name FROM information_schema.columns
         WHERE table_schema = 'public' AND data_type = 'timestamp without time zone'`,
      );
      expect(rows).toEqual([]);
    } finally {
      await close();
    }
  });
});
