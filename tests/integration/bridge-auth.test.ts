import { describe, expect, it } from "vitest";
import { makeTestDb, createTestUser } from "../helpers/db";
import { scoped } from "@/lib/db/scoped";
import type { Db } from "@/lib/db/client";
import { authenticate, type BridgeDeps } from "@/lib/bridge/auth";
import { createApiToken, revokeApiToken } from "@/lib/auth/api-token";
import { RATE_LIMIT_PER_MINUTE } from "@/lib/bridge/wire";

const URL_ = "http://test.local/api/mcp";

function depsFor(db: Db, now: () => Date = () => new Date()): BridgeDeps {
  return { db, now, revalidate: () => {}, requestId: () => "req-1" };
}

async function seedToken(db: Db, email: string) {
  const user = await createTestUser(db, email);
  const s = scoped(db, user.id);
  const created = await createApiToken(s, "Test");
  if (!created.ok) throw new Error("token setup failed");
  return { user, s, token: created.data.token };
}

async function run(deps: BridgeDeps, headers: Record<string, string>) {
  return authenticate(deps, new Request(URL_, { headers }), "req-1", deps.now());
}

async function expectUnauthorized(result: Awaited<ReturnType<typeof run>>) {
  expect(result.ok).toBe(false);
  if (result.ok) return;
  expect(result.response.status).toBe(401);
  expect((await result.response.json()).error.code).toBe("unauthorized");
}

describe("authenticate", () => {
  it("answers 401 unauthorized for no header, a Basic header, a malformed token, an unknown token and a revoked token", async () => {
    const { db, close } = await makeTestDb();
    try {
      const { s, token } = await seedToken(db, "auth1@example.com");
      const deps = depsFor(db);
      await expectUnauthorized(await run(deps, {}));
      await expectUnauthorized(await run(deps, { authorization: `Basic ${btoa("a:b")}` }));
      await expectUnauthorized(await run(deps, { authorization: "Bearer not-a-real-token" }));
      await expectUnauthorized(await run(deps, { authorization: `Bearer jsm_${"z".repeat(43)}` }));
      const list = await s.apiToken.list();
      await revokeApiToken(s, list[0]!.id);
      await expectUnauthorized(await run(deps, { authorization: `Bearer ${token}` }));
    } finally {
      await close();
    }
  });

  it("never reads a cookie: a session-looking cookie alone is 401", async () => {
    const { db, close } = await makeTestDb();
    try {
      await expectUnauthorized(
        await run(depsFor(db), { cookie: "better-auth.session_token=some-real-looking-session-value" }),
      );
    } finally {
      await close();
    }
  });

  it("returns ok with the token owner's userId and a Scoped for that user", async () => {
    const { db, close } = await makeTestDb();
    try {
      const { user, token } = await seedToken(db, "auth2@example.com");
      const other = await seedToken(db, "auth3@example.com");
      const result = await run(depsFor(db), { authorization: `Bearer ${token}` });
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.userId).toBe(user.id);
      // The Scoped sees this user's tokens and not the other user's.
      const mine = await result.s.apiToken.list();
      expect(mine).toHaveLength(1);
      expect(other.token).not.toBe(token);
    } finally {
      await close();
    }
  });

  it("counts each call once: the 120th passes, the 121st is 429 rate_limited with Retry-After between 1 and 60", async () => {
    const { db, close } = await makeTestDb();
    try {
      const { token } = await seedToken(db, "auth4@example.com");
      const fixedNow = new Date("2026-10-01T10:00:05.000Z");
      const deps = depsFor(db, () => fixedNow);
      expect(RATE_LIMIT_PER_MINUTE).toBe(120);
      for (let i = 0; i < RATE_LIMIT_PER_MINUTE; i++) {
        const r = await run(deps, { authorization: `Bearer ${token}` });
        expect(r.ok).toBe(true);
      }
      const over = await run(deps, { authorization: `Bearer ${token}` });
      expect(over.ok).toBe(false);
      if (over.ok) return;
      expect(over.response.status).toBe(429);
      expect((await over.response.json()).error.code).toBe("rate_limited");
      const retryAfter = Number(over.response.headers.get("Retry-After"));
      expect(retryAfter).toBeGreaterThanOrEqual(1);
      expect(retryAfter).toBeLessThanOrEqual(60);
    } finally {
      await close();
    }
  });
});
