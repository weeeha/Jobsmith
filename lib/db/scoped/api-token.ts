import { and, desc, eq, sql } from "drizzle-orm";
import * as schema from "../schema";
import type { Db } from "../client";
import { stripScopedKeys } from "./strip";

export type ApiTokenRow = typeof schema.apiToken.$inferSelect;
export type ApiTokenListItem = Pick<ApiTokenRow, "id" | "name" | "prefix" | "createdAt" | "lastUsedAt" | "revokedAt">;

const LIST_COLUMNS = {
  id: schema.apiToken.id,
  name: schema.apiToken.name,
  prefix: schema.apiToken.prefix,
  createdAt: schema.apiToken.createdAt,
  lastUsedAt: schema.apiToken.lastUsedAt,
  revokedAt: schema.apiToken.revokedAt,
};

export function apiTokenQueries(db: Db, userId: string) {
  return {
    async list(): Promise<ApiTokenListItem[]> {
      return db
        .select(LIST_COLUMNS)
        .from(schema.apiToken)
        .where(eq(schema.apiToken.userId, userId))
        .orderBy(desc(schema.apiToken.createdAt));
    },
    async insert(values: { name: string; tokenHash: string; prefix: string }): Promise<ApiTokenListItem> {
      const fields = stripScopedKeys(values);
      const [row] = await db
        .insert(schema.apiToken)
        .values({ ...fields, userId })
        .returning(LIST_COLUMNS);
      return row;
    },
    async revoke(id: string, now: Date): Promise<ApiTokenListItem | null> {
      const [row] = await db
        .update(schema.apiToken)
        .set({ revokedAt: sql`coalesce(${schema.apiToken.revokedAt}, ${now.toISOString()}::timestamptz)` })
        .where(and(eq(schema.apiToken.id, id), eq(schema.apiToken.userId, userId)))
        .returning(LIST_COLUMNS);
      return row ?? null;
    },
  };
}
