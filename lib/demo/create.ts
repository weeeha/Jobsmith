import crypto from "node:crypto";
import { and, count, eq, gte, like, lt } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { getDb } from "@/lib/db/client";
import { scopedFor } from "@/lib/db/scoped";
import * as schema from "@/lib/db/schema";
import { seedJobs } from "./seed-jobs";
import { DEMO_SIGNUP_HEADER, demoSignupKey } from "./signup-key";
import { DEMO_EMAIL_DOMAIN, demoCreationAllowed, demoExpiryCutoff } from "./policy";

const demoEmails = like(schema.user.email, `%@${DEMO_EMAIL_DOMAIN}`);

/**
 * Deletes demo copies older than the TTL. Every table cascades from `user`,
 * so this removes their jobs, notes, sessions and tokens too. Runs on each
 * demo click instead of on a schedule, so a quiet instance needs no cron.
 */
async function deleteExpiredDemoAccounts(now: Date) {
  await getDb()
    .delete(schema.user)
    .where(and(demoEmails, lt(schema.user.createdAt, demoExpiryCutoff(now))));
}

async function demoCapacity(now: Date) {
  const db = getDb();
  const [alive] = await db.select({ value: count() }).from(schema.user).where(demoEmails);
  const [recent] = await db
    .select({ value: count() })
    .from(schema.user)
    .where(and(demoEmails, gte(schema.user.createdAt, new Date(now.getTime() - 60_000))));
  return { alive: alive?.value ?? 0, createdLastMinute: recent?.value ?? 0 };
}

export type DemoResult = { ok: true } | { ok: false; reason: "busy" | "failed" };

/**
 * Creates a throwaway account with the six fictional jobs and signs the
 * current request into it (the nextCookies plugin sets the session cookie
 * from inside a server action). The visitor never sees the password.
 */
export async function createDemoAccount(now = new Date()): Promise<DemoResult> {
  await deleteExpiredDemoAccounts(now);
  if (!demoCreationAllowed(await demoCapacity(now))) {
    return { ok: false, reason: "busy" };
  }

  const id = crypto.randomBytes(8).toString("hex");
  let userId: string | undefined;
  try {
    const result = await auth.api.signUpEmail({
      body: {
        email: `visitor-${id}@${DEMO_EMAIL_DOMAIN}`,
        password: crypto.randomBytes(24).toString("base64url"),
        name: "Demo visitor",
      },
      headers: { [DEMO_SIGNUP_HEADER]: demoSignupKey() },
    });
    userId = result.user.id;
    const s = scopedFor(userId);
    await s.profile.upsert({
      headline: "Product designer exploring new roles",
      resumeMd:
        "# Demo resume\n\nFictional data. This demo copy and everything in it is deleted after 24 hours.",
    });
    await seedJobs(s);
    return { ok: true };
  } catch (error) {
    console.error("demo account failed", error);
    // A half-filled copy is worse than none: remove it, and with it the
    // session the sign-up just opened.
    if (userId) await getDb().delete(schema.user).where(eq(schema.user.id, userId));
    return { ok: false, reason: "failed" };
  }
}
