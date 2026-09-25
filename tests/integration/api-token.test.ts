import { describe, expect, it } from "vitest";
import { makeTestDb, createTestUser } from "../helpers/db";
import { scoped } from "@/lib/db/scoped";
import { createApiToken, listApiTokens, revokeApiToken, authenticateBearer } from "@/lib/auth/api-token";

describe("createApiToken / listApiTokens", () => {
  it("returns the plain token once, stores only its hash, and lists it without the hash", async () => {
    const { db, close } = await makeTestDb();
    try {
      const user = await createTestUser(db, "alice@example.com");
      const s = scoped(db, user.id);

      const created = await createApiToken(s, "Laptop");
      expect(created.ok).toBe(true);
      if (!created.ok) return;
      expect(created.data.token.startsWith("jsm_")).toBe(true);
      expect(created.data.item.name).toBe("Laptop");
      expect(created.data.item.prefix).toBe(created.data.token.slice(0, 8));
      expect(created.data.item).not.toHaveProperty("tokenHash");

      const list = await listApiTokens(s);
      expect(list).toHaveLength(1);
      expect(list[0]).not.toHaveProperty("tokenHash");
      expect(list[0]!.id).toBe(created.data.item.id);
    } finally {
      await close();
    }
  });

  it("rejects a blank name and writes nothing", async () => {
    const { db, close } = await makeTestDb();
    try {
      const user = await createTestUser(db, "bob@example.com");
      const s = scoped(db, user.id);

      const result = await createApiToken(s, "   ");
      expect(result).toMatchObject({ ok: false, code: "invalid", message: "Give the token a name." });
      expect(await listApiTokens(s)).toEqual([]);
    } finally {
      await close();
    }
  });
});

describe("revokeApiToken", () => {
  it("is idempotent for its own owner and refuses another user's token", async () => {
    const { db, close } = await makeTestDb();
    try {
      const alice = await createTestUser(db, "alice2@example.com");
      const bob = await createTestUser(db, "bob2@example.com");
      const sa = scoped(db, alice.id);
      const sb = scoped(db, bob.id);
      const created = await createApiToken(sa, "Laptop");
      if (!created.ok) throw new Error("setup failed");

      const crossUser = await revokeApiToken(sb, created.data.item.id);
      expect(crossUser).toMatchObject({ ok: false, code: "token_not_found" });
      // Confirming the cross-user attempt above did not revoke it for its
      // real owner is what makes this case discriminating: a buggy
      // revokeApiToken that ignores the caller's userId entirely would still
      // report token_not_found by accident if it also failed to find the
      // row for an unrelated reason, but it would leave the row revoked.
      const stillActive = await listApiTokens(sa);
      expect(stillActive[0]!.revokedAt).toBeNull();

      const now = new Date("2026-09-19T12:00:00.000Z");
      const first = await revokeApiToken(sa, created.data.item.id, now);
      expect(first.ok).toBe(true);
      const afterFirst = await listApiTokens(sa);
      expect(afterFirst[0]!.revokedAt?.toISOString()).toBe(now.toISOString());

      const second = await revokeApiToken(sa, created.data.item.id, new Date("2026-09-20T00:00:00.000Z"));
      expect(second.ok).toBe(true);
      const afterSecond = await listApiTokens(sa);
      // Still the FIRST revoke's timestamp: revoking twice does not move it.
      expect(afterSecond[0]!.revokedAt?.toISOString()).toBe(now.toISOString());
    } finally {
      await close();
    }
  });

  it("reports token_not_found for an id that never existed", async () => {
    const { db, close } = await makeTestDb();
    try {
      const user = await createTestUser(db, "carol@example.com");
      const s = scoped(db, user.id);
      const result = await revokeApiToken(s, crypto.randomUUID());
      expect(result).toMatchObject({ ok: false, code: "token_not_found" });
    } finally {
      await close();
    }
  });
});

describe("authenticateBearer", () => {
  it("counts requests inside one window, resets in the next window, and writes last_used_at", async () => {
    const { db, close } = await makeTestDb();
    try {
      const user = await createTestUser(db, "dora@example.com");
      const s = scoped(db, user.id);
      const created = await createApiToken(s, "Laptop");
      if (!created.ok) throw new Error("setup failed");
      const token = created.data.token;

      const first = await authenticateBearer(db, token, new Date("2026-10-01T10:00:05.000Z"));
      expect(first).toMatchObject({ userId: user.id, count: 1 });

      const second = await authenticateBearer(db, token, new Date("2026-10-01T10:00:59.000Z"));
      expect(second?.count).toBe(2);

      // A new 60-second window (10:01:00 floors to a different windowStart
      // than 10:00:05 and 10:00:59 both do) resets the counter to 1, not 3.
      const third = await authenticateBearer(db, token, new Date("2026-10-01T10:01:00.000Z"));
      expect(third?.count).toBe(1);

      const list = await listApiTokens(s);
      expect(list[0]!.lastUsedAt?.toISOString()).toBe("2026-10-01T10:01:00.000Z");
    } finally {
      await close();
    }
  });

  it("returns null for a revoked token, an unknown token, and a malformed token, none of which change last_used_at", async () => {
    const { db, close } = await makeTestDb();
    try {
      const user = await createTestUser(db, "erin@example.com");
      const s = scoped(db, user.id);
      const created = await createApiToken(s, "Laptop");
      if (!created.ok) throw new Error("setup failed");
      const now = new Date("2026-10-02T00:00:00.000Z");

      // Right shape (passes TOKEN_PATTERN) but never issued: no row to match.
      expect(await authenticateBearer(db, `jsm_${"z".repeat(43)}`, now)).toBeNull();
      // Wrong shape entirely: rejected before any query runs.
      expect(await authenticateBearer(db, "not-a-token", now)).toBeNull();

      await revokeApiToken(s, created.data.item.id, now);
      expect(await authenticateBearer(db, created.data.token, now)).toBeNull();

      // None of the three attempts above touched the row.
      const list = await listApiTokens(s);
      expect(list[0]!.lastUsedAt).toBeNull();
    } finally {
      await close();
    }
  });
});
