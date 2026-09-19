import { eq } from "drizzle-orm";
import * as schema from "./schema";
import type { Db } from "./client";
import { getDb } from "./client";

export type ProfileFields = Omit<
  typeof schema.profile.$inferInsert,
  "userId" | "createdAt" | "updatedAt"
>;

function stripScopedKeys<T extends object>(
  values: T,
): Omit<T, "userId" | "createdAt" | "updatedAt"> {
  const clone = { ...values } as Record<string, unknown>;
  delete clone.userId;
  delete clone.createdAt;
  delete clone.updatedAt;
  return clone as Omit<T, "userId" | "createdAt" | "updatedAt">;
}

export function scoped(db: Db, userId: string) {
  return {
    profile: {
      async get() {
        const [row] = await db
          .select()
          .from(schema.profile)
          .where(eq(schema.profile.userId, userId));
        return row ?? null;
      },
      async upsert(values: Partial<ProfileFields>) {
        const fields = stripScopedKeys(values);
        const [row] = await db
          .insert(schema.profile)
          .values({ ...fields, userId })
          .onConflictDoUpdate({
            target: schema.profile.userId,
            // `set` must never be empty (drizzle throws "No values to set"
            // if it is), and every update should bump updatedAt regardless
            // of which fields actually changed.
            set: { ...fields, updatedAt: new Date() },
          })
          .returning();
        return row;
      },
    },
  };
}

export function scopedFor(userId: string) {
  return scoped(getDb(), userId);
}
