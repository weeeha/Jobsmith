import { and, asc, eq, isNull } from "drizzle-orm";
import * as schema from "../schema";
import type { Db } from "../client";
import { stripScopedKeys } from "./strip";

export type LibraryItemRow = typeof schema.libraryItem.$inferSelect;
export type LibraryItemFields = Omit<
  typeof schema.libraryItem.$inferInsert,
  "id" | "userId" | "createdAt" | "updatedAt"
>;

export function libraryItemQueries(db: Db, userId: string) {
  const table = schema.libraryItem;
  return {
    async insert(values: LibraryItemFields): Promise<LibraryItemRow> {
      const fields = stripScopedKeys(values);
      const [row] = await db
        .insert(table)
        .values({ ...fields, userId })
        .returning();
      return row;
    },
    async getById(id: string): Promise<LibraryItemRow | null> {
      const [row] = await db
        .select()
        .from(table)
        .where(and(eq(table.id, id), eq(table.userId, userId)));
      return row ?? null;
    },
    async update(id: string, values: Partial<LibraryItemFields>): Promise<LibraryItemRow | null> {
      const fields = stripScopedKeys(values);
      const [row] = await db
        .update(table)
        .set({ ...fields, updatedAt: new Date() })
        .where(and(eq(table.id, id), eq(table.userId, userId)))
        .returning();
      return row ?? null;
    },
    async list(options: { includeArchived: boolean }): Promise<LibraryItemRow[]> {
      return db
        .select()
        .from(table)
        .where(
          options.includeArchived
            ? eq(table.userId, userId)
            : and(eq(table.userId, userId), isNull(table.archivedAt)),
        )
        .orderBy(asc(table.createdAt));
    },
    async findBySource(questionKey: string, sourceOpportunityId: string | null): Promise<LibraryItemRow | null> {
      const [row] = await db
        .select()
        .from(table)
        .where(
          and(
            eq(table.userId, userId),
            eq(table.questionKey, questionKey),
            sourceOpportunityId === null
              ? isNull(table.sourceOpportunityId)
              : eq(table.sourceOpportunityId, sourceOpportunityId),
          ),
        )
        .orderBy(asc(table.createdAt))
        .limit(1);
      return row ?? null;
    },
    async listAll(): Promise<LibraryItemRow[]> {
      return db
        .select()
        .from(table)
        .where(eq(table.userId, userId))
        .orderBy(asc(table.createdAt));
    },
  };
}
