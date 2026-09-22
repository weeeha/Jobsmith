import { and, desc, eq } from "drizzle-orm";
import * as schema from "../schema";
import type { Db } from "../client";
import { stripScopedKeys } from "./strip";

export type EventRow = typeof schema.event.$inferSelect;
export type EventFields = Omit<
  typeof schema.event.$inferInsert,
  "id" | "userId" | "createdAt" | "updatedAt"
>;

export function eventQueries(db: Db, userId: string) {
  return {
    async insert(values: EventFields): Promise<EventRow> {
      const fields = stripScopedKeys(values);
      const [row] = await db
        .insert(schema.event)
        .values({ ...fields, userId })
        .returning();
      return row;
    },
    async listForOpportunity(opportunityId: string): Promise<EventRow[]> {
      return db
        .select()
        .from(schema.event)
        .where(and(eq(schema.event.opportunityId, opportunityId), eq(schema.event.userId, userId)))
        .orderBy(desc(schema.event.occurredAt));
    },
  };
}
