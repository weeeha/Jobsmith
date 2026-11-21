import { and, asc, eq } from "drizzle-orm";
import * as schema from "../schema";
import type { Db } from "../client";
import { stripScopedKeys } from "./strip";

export type PrepSessionRow = typeof schema.prepSession.$inferSelect;
export type PrepSessionFields = Omit<
  typeof schema.prepSession.$inferInsert,
  "id" | "userId" | "createdAt" | "updatedAt"
>;

export function prepSessionQueries(db: Db, userId: string) {
  const table = schema.prepSession;
  return {
    async insert(values: PrepSessionFields): Promise<PrepSessionRow> {
      const fields = stripScopedKeys(values);
      const [row] = await db
        .insert(table)
        .values({ ...fields, userId })
        .returning();
      return row;
    },
    async getById(id: string): Promise<PrepSessionRow | null> {
      const [row] = await db
        .select()
        .from(table)
        .where(and(eq(table.id, id), eq(table.userId, userId)));
      return row ?? null;
    },
    async update(id: string, values: Partial<PrepSessionFields>): Promise<PrepSessionRow | null> {
      const fields = stripScopedKeys(values);
      const [row] = await db
        .update(table)
        .set({ ...fields, updatedAt: new Date() })
        .where(and(eq(table.id, id), eq(table.userId, userId)))
        .returning();
      return row ?? null;
    },
    async listForJob(opportunityId: string): Promise<PrepSessionRow[]> {
      return db
        .select()
        .from(table)
        .where(and(eq(table.userId, userId), eq(table.opportunityId, opportunityId)))
        .orderBy(asc(table.startedAt));
    },
    async listAll(): Promise<PrepSessionRow[]> {
      return db
        .select()
        .from(table)
        .where(eq(table.userId, userId))
        .orderBy(asc(table.startedAt));
    },
  };
}
