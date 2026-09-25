import { randomBytes, createHash } from "node:crypto";
import { z } from "zod";
import { eq, and, isNull, sql } from "drizzle-orm";
import * as schema from "@/lib/db/schema";
import type { Db } from "@/lib/db/client";
import type { Scoped, ApiTokenListItem } from "@/lib/db/scoped";
import { type Result, ok, fail } from "@/lib/result";
import type { FormStateWith } from "@/lib/forms/state";
import { TOKEN_PATTERN } from "@/lib/bridge/wire";

export function generateToken(): { token: string; hash: string; prefix: string } {
  const token = `jsm_${randomBytes(32).toString("base64url")}`;
  const hash = hashToken(token);
  const prefix = token.slice(0, 8);
  return { token, hash, prefix };
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export type TokenFormState = FormStateWith<{ token: string; name: string }>;

export const tokenNameSchema: z.ZodType<string> = z
  .string()
  .trim()
  .min(1, "Give the token a name.")
  .max(60, "Keep the name to 60 characters or fewer.");

export async function createApiToken(
  s: Scoped,
  name: string,
): Promise<Result<{ token: string; item: ApiTokenListItem }, "invalid">> {
  const parsed = tokenNameSchema.safeParse(name);
  if (!parsed.success) {
    // safeParse's failure branch always carries at least one issue.
    return fail("invalid", parsed.error.issues[0]!.message);
  }
  const { token, hash, prefix } = generateToken();
  const item = await s.apiToken.insert({ name: parsed.data, tokenHash: hash, prefix });
  return ok({ token, item });
}

export async function listApiTokens(s: Scoped): Promise<ApiTokenListItem[]> {
  return s.apiToken.list();
}

export async function revokeApiToken(
  s: Scoped,
  id: string,
  now: Date = new Date(),
): Promise<Result<null, "token_not_found">> {
  const revoked = await s.apiToken.revoke(id, now);
  if (!revoked) {
    return fail("token_not_found", "This token no longer exists.");
  }
  return ok(null);
}

export type BearerAuth = { tokenId: string; userId: string; count: number; windowStart: Date };

export async function authenticateBearer(db: Db, token: string, now: Date): Promise<BearerAuth | null> {
  // The shape check first, with no query, means an arbitrary Authorization
  // header (a session-cookie-shaped value, a different app's API key, a
  // stray "Bearer undefined") never reaches the database at all.
  if (!TOKEN_PATTERN.test(token)) {
    return null;
  }
  const hash = hashToken(token);
  const windowStart = new Date(Math.floor(now.getTime() / 60_000) * 60_000);
  // One statement: authenticate, touch last_used_at and count the
  // rate limit together, so nothing can read the counter between two
  // separate statements and race it. The bound windowStart is cast
  // explicitly (::timestamptz) because PGlite cannot infer a parameter's
  // type from its position inside a CASE expression; Postgres proper can
  // usually infer it, but the explicit cast is correct and harmless there
  // too, so both databases take the same statement.
  const rows = await db
    .update(schema.apiToken)
    .set({
      lastUsedAt: now,
      rateWindowStart: windowStart,
      rateCount: sql`case when ${schema.apiToken.rateWindowStart} = ${windowStart.toISOString()}::timestamptz then ${schema.apiToken.rateCount} + 1 else 1 end`,
    })
    .where(and(eq(schema.apiToken.tokenHash, hash), isNull(schema.apiToken.revokedAt)))
    .returning({ id: schema.apiToken.id, userId: schema.apiToken.userId, count: schema.apiToken.rateCount });
  const row = rows[0];
  if (!row) {
    return null;
  }
  return { tokenId: row.id, userId: row.userId, count: row.count, windowStart };
}
