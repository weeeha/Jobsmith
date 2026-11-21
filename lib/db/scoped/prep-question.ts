import { and, asc, count, eq } from "drizzle-orm";
import * as schema from "../schema";
import type { Db } from "../client";
import { stripScopedKeys } from "./strip";

export type PrepQuestionRow = typeof schema.prepQuestion.$inferSelect;
export type PrepQuestionFields = Omit<
  typeof schema.prepQuestion.$inferInsert,
  "id" | "userId" | "createdAt" | "updatedAt"
>;

export function prepQuestionQueries(db: Db, userId: string) {
  const table = schema.prepQuestion;
  return {
    async listForJob(opportunityId: string): Promise<PrepQuestionRow[]> {
      return db
        .select()
        .from(table)
        .where(and(eq(table.userId, userId), eq(table.opportunityId, opportunityId)))
        .orderBy(asc(table.artifactKey), asc(table.position));
    },
    async listForArtifactKey(opportunityId: string, artifactKey: string): Promise<PrepQuestionRow[]> {
      return db
        .select()
        .from(table)
        .where(
          and(eq(table.userId, userId), eq(table.opportunityId, opportunityId), eq(table.artifactKey, artifactKey)),
        )
        .orderBy(asc(table.position));
    },
    // Deletes every row of one document key in one job, then inserts the new
    // rows. An empty list only deletes. Run inside the caller's transaction so
    // a failed insert leaves the old rows in place.
    async replaceForArtifactKey(
      opportunityId: string,
      artifactKey: string,
      rows: PrepQuestionFields[],
    ): Promise<number> {
      await db
        .delete(table)
        .where(
          and(eq(table.userId, userId), eq(table.opportunityId, opportunityId), eq(table.artifactKey, artifactKey)),
        );
      if (rows.length === 0) return 0;
      const values = rows.map((r) => ({ ...stripScopedKeys(r), userId }));
      const inserted = await db.insert(table).values(values).returning({ id: table.id });
      return inserted.length;
    },
    async listByQuestionKey(questionKey: string): Promise<PrepQuestionRow[]> {
      return db
        .select()
        .from(table)
        .where(and(eq(table.userId, userId), eq(table.questionKey, questionKey)))
        .orderBy(asc(table.createdAt));
    },
    async countsByOpportunity(): Promise<Map<string, number>> {
      const rows = await db
        .select({ opportunityId: table.opportunityId, n: count() })
        .from(table)
        .where(eq(table.userId, userId))
        .groupBy(table.opportunityId);
      return new Map(rows.map((r) => [r.opportunityId, Number(r.n)]));
    },
    // Question keys per job, one entry per row, for Home's confidence line.
    async keysByOpportunity(): Promise<Map<string, string[]>> {
      const rows = await db
        .select({ opportunityId: table.opportunityId, questionKey: table.questionKey })
        .from(table)
        .where(eq(table.userId, userId));
      const out = new Map<string, string[]>();
      for (const r of rows) {
        const keys = out.get(r.opportunityId);
        if (keys) keys.push(r.questionKey);
        else out.set(r.opportunityId, [r.questionKey]);
      }
      return out;
    },
    async listAll(): Promise<PrepQuestionRow[]> {
      return db
        .select()
        .from(table)
        .where(eq(table.userId, userId))
        .orderBy(asc(table.createdAt), asc(table.position));
    },
  };
}
