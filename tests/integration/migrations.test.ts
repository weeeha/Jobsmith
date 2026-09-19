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
});
