import { and, asc, count, eq, inArray, sql } from "drizzle-orm";
import * as schema from "../schema";
import type { Db } from "../client";
import { stripScopedKeys } from "./strip";

export type AssetRow = typeof schema.asset.$inferSelect;
export type AssetFields = Omit<typeof schema.asset.$inferInsert, "id" | "userId" | "createdAt" | "updatedAt">;

export function assetQueries(db: Db, userId: string) {
  const table = schema.asset;
  return {
    async insert(values: AssetFields): Promise<AssetRow> {
      const fields = stripScopedKeys(values);
      const [row] = await db
        .insert(table)
        .values({ ...fields, userId })
        .returning();
      return row;
    },
    async getById(id: string): Promise<AssetRow | null> {
      const [row] = await db
        .select()
        .from(table)
        .where(and(eq(table.id, id), eq(table.userId, userId)));
      return row ?? null;
    },
    // Only the caller's own assets: an id of another user's is simply absent.
    async listByIds(ids: string[]): Promise<AssetRow[]> {
      if (ids.length === 0) return [];
      return db
        .select()
        .from(table)
        .where(and(eq(table.userId, userId), inArray(table.id, ids)));
    },
    // Returns the deleted row so the caller can delete the stored object.
    async delete(id: string): Promise<AssetRow | null> {
      const [row] = await db
        .delete(table)
        .where(and(eq(table.id, id), eq(table.userId, userId)))
        .returning();
      return row ?? null;
    },
    async totals(): Promise<{ bytes: number; clips: number }> {
      const [row] = await db
        .select({ bytes: sql<number>`coalesce(sum(${table.bytes}), 0)`, clips: count() })
        .from(table)
        .where(eq(table.userId, userId));
      return { bytes: Number(row?.bytes ?? 0), clips: Number(row?.clips ?? 0) };
    },
    async listAll(): Promise<AssetRow[]> {
      return db
        .select()
        .from(table)
        .where(eq(table.userId, userId))
        .orderBy(asc(table.createdAt));
    },
  };
}
