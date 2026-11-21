import { and, asc, eq, inArray, count } from "drizzle-orm";
import * as schema from "../schema";
import type { Db } from "../client";
import { stripScopedKeys } from "./strip";
import type { SegmentStatus } from "@/lib/prep/values";

export type TtsSegmentRow = typeof schema.ttsSegment.$inferSelect;
export type TtsSegmentFields = Omit<
  typeof schema.ttsSegment.$inferInsert,
  "id" | "userId" | "createdAt" | "updatedAt"
>;

export function ttsSegmentQueries(db: Db, userId: string) {
  const table = schema.ttsSegment;
  return {
    async listByHashes(hashes: string[]): Promise<TtsSegmentRow[]> {
      if (hashes.length === 0) return [];
      return db
        .select()
        .from(table)
        .where(and(eq(table.userId, userId), inArray(table.hash, hashes)));
    },
    // Null when a segment with this hash already exists, so two writers racing
    // on one hash never fail and the loser reads the winner's row.
    async insert(values: TtsSegmentFields): Promise<TtsSegmentRow | null> {
      const fields = stripScopedKeys(values);
      const [row] = await db
        .insert(table)
        .values({ ...fields, userId })
        .onConflictDoNothing({ target: [table.userId, table.hash] })
        .returning();
      return row ?? null;
    },
    async update(id: string, values: Partial<TtsSegmentFields>): Promise<TtsSegmentRow | null> {
      const fields = stripScopedKeys(values);
      const [row] = await db
        .update(table)
        .set({ ...fields, updatedAt: new Date() })
        .where(and(eq(table.id, id), eq(table.userId, userId)))
        .returning();
      return row ?? null;
    },
    async deleteByIds(ids: string[]): Promise<number> {
      if (ids.length === 0) return 0;
      const rows = await db
        .delete(table)
        .where(and(eq(table.userId, userId), inArray(table.id, ids)))
        .returning({ id: table.id });
      return rows.length;
    },
    async statusCounts(): Promise<Record<SegmentStatus, number>> {
      const rows = await db
        .select({ status: table.status, n: count() })
        .from(table)
        .where(eq(table.userId, userId))
        .groupBy(table.status);
      const out: Record<SegmentStatus, number> = { pending: 0, done: 0, failed: 0 };
      for (const r of rows) out[r.status] = Number(r.n);
      return out;
    },
    async listAll(): Promise<TtsSegmentRow[]> {
      return db
        .select()
        .from(table)
        .where(eq(table.userId, userId))
        .orderBy(asc(table.createdAt));
    },
  };
}
