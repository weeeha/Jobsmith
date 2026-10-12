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
    // Ordered newest first. `occurredAt` is caller-supplied (some callers
    // pass the same `now` to more than one write inside a single request,
    // e.g. creating an opportunity's default stages), so it can legitimately tie
    // across rows; `createdAt` (this row's own insert-time default, which
    // Postgres fixes per transaction, not per statement) breaks the tie in
    // favor of whichever event was actually written most recently.
    async listForOpportunity(opportunityId: string): Promise<EventRow[]> {
      return db
        .select()
        .from(schema.event)
        .where(and(eq(schema.event.opportunityId, opportunityId), eq(schema.event.userId, userId)))
        .orderBy(desc(schema.event.occurredAt), desc(schema.event.createdAt));
    },
    // The newest document pushes with the job they belong to, for Home. Both
    // joins go through user_id.
    async listRecentPushes(
      limit: number,
    ): Promise<{ id: string; occurredAt: Date; meta: unknown; slug: string; roleTitle: string; companyName: string }[]> {
      return db
        .select({
          id: schema.event.id,
          occurredAt: schema.event.occurredAt,
          meta: schema.event.meta,
          slug: schema.opportunity.slug,
          roleTitle: schema.opportunity.roleTitle,
          companyName: schema.company.name,
        })
        .from(schema.event)
        .innerJoin(
          schema.opportunity,
          and(eq(schema.opportunity.userId, userId), eq(schema.opportunity.id, schema.event.opportunityId)),
        )
        .innerJoin(
          schema.company,
          and(eq(schema.company.userId, userId), eq(schema.company.id, schema.opportunity.companyId)),
        )
        .where(and(eq(schema.event.userId, userId), eq(schema.event.kind, "artifact_pushed")))
        .orderBy(desc(schema.event.occurredAt), desc(schema.event.createdAt))
        .limit(limit);
    },
  };
}
