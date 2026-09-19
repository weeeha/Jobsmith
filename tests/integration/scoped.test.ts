import { describe, expect, it } from "vitest";
import { makeTestDb, createTestUser } from "../helpers/db";
import { scoped } from "@/lib/db/scoped";

describe("scoped profile isolation", () => {
  it("prevents one user from reading or overwriting another user's profile", async () => {
    const { db, close } = await makeTestDb();
    try {
      const alice = await createTestUser(db, "alice@example.com");
      const bob = await createTestUser(db, "bob@example.com");

      await scoped(db, alice.id).profile.upsert({ headline: "Alice's headline" });
      await scoped(db, bob.id).profile.upsert({ headline: "Bob's headline" });

      expect((await scoped(db, alice.id).profile.get())?.headline).toBe("Alice's headline");
      expect((await scoped(db, bob.id).profile.get())?.headline).toBe("Bob's headline");

      await scoped(db, bob.id).profile.upsert({ headline: "Bob overwrites" });

      expect((await scoped(db, alice.id).profile.get())?.headline).toBe("Alice's headline");
    } finally {
      await close();
    }
  });

  it("ignores a userId smuggled inside values, so a caller cannot write another user's row", async () => {
    const { db, close } = await makeTestDb();
    try {
      const alice = await createTestUser(db, "alice2@example.com");
      const bob = await createTestUser(db, "bob2@example.com");

      await scoped(db, bob.id).profile.upsert({ headline: "Bob's original headline" });

      // Alice tries to smuggle Bob's userId inside the values object. The
      // type system blocks this (ProfileFields excludes userId), so the
      // attack has to go through `as never` to compile at all.
      await scoped(db, alice.id).profile.upsert({
        userId: bob.id,
        headline: "Alice overwrote Bob",
      } as never);

      const bobProfile = await scoped(db, bob.id).profile.get();
      const aliceProfile = await scoped(db, alice.id).profile.get();

      expect(bobProfile?.headline).toBe("Bob's original headline");
      expect(aliceProfile?.headline).toBe("Alice overwrote Bob");
    } finally {
      await close();
    }
  });

  it("creates a profile row with column defaults when called with no fields", async () => {
    const { db, close } = await makeTestDb();
    try {
      const user = await createTestUser(db, "owner@example.com");
      const row = await scoped(db, user.id).profile.upsert({});
      expect(row.userId).toBe(user.id);
      expect(row.timezone).toBe("UTC");
      expect(row.preferences).toEqual({});
    } finally {
      await close();
    }
  });
});
