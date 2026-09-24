import { eq } from "drizzle-orm";
import * as schema from "../schema";
import type { Db } from "../client";
import { stripScopedKeys } from "./strip";

export type ProfileRow = typeof schema.profile.$inferSelect;
export type ProfileFields = Omit<
  typeof schema.profile.$inferInsert,
  "userId" | "createdAt" | "updatedAt"
>;

export function profileQueries(db: Db, userId: string) {
  return {
    async get(): Promise<ProfileRow | null> {
      const [row] = await db.select().from(schema.profile).where(eq(schema.profile.userId, userId));
      return row ?? null;
    },
    async upsert(values: Partial<ProfileFields>): Promise<ProfileRow> {
      const fields = stripScopedKeys(values);
      const [row] = await db
        .insert(schema.profile)
        .values({ ...fields, userId })
        .onConflictDoUpdate({
          target: schema.profile.userId,
          set: { ...fields, updatedAt: new Date() },
        })
        .returning();
      return row;
    },
  };
}
