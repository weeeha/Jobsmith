import { describe, expect, it } from "vitest";
import { makeTestDb, createTestUser } from "../helpers/db";
import { countUsers } from "@/lib/auth/users";

describe("countUsers", () => {
  it("counts zero users on a fresh database", async () => {
    const { db, close } = await makeTestDb();
    try {
      expect(await countUsers(db)).toBe(0);
    } finally {
      await close();
    }
  });

  it("counts users after they are created", async () => {
    const { db, close } = await makeTestDb();
    try {
      await createTestUser(db, "one@example.com");
      await createTestUser(db, "two@example.com");
      expect(await countUsers(db)).toBe(2);
    } finally {
      await close();
    }
  });
});
