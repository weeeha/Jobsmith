import { and, asc, desc, eq, gte, max, sql } from "drizzle-orm";
import * as schema from "../schema";
import type { Db } from "../client";
import { stripScopedKeys } from "./strip";

export type EventRow = typeof schema.event.$inferSelect;
export type EventFields = Omit<
  typeof schema.event.$inferInsert,
  "id" | "userId" | "createdAt" | "updatedAt"
>;

export type FeedEventRow = {
  id: string;
  kind: string;
  slug: string;
  stageLabel: string | null;
  occurredAt: Date;
  createdAt: Date;
  body: string | null;
  meta: unknown;
};

export function eventQueries(db: Db, userId: string) {
  return {
    async listAll(): Promise<EventRow[]> {
      return db
        .select()
        .from(schema.event)
        .where(eq(schema.event.userId, userId))
        .orderBy(asc(schema.event.occurredAt), asc(schema.event.createdAt));
    },
    // Newest event time per job, for Home's "follow up?" rule.
    async lastOccurredByOpportunity(): Promise<Map<string, Date>> {
      const rows = await db
        .select({ opportunityId: schema.event.opportunityId, last: max(schema.event.occurredAt) })
        .from(schema.event)
        .where(eq(schema.event.userId, userId))
        .groupBy(schema.event.opportunityId);
      const out = new Map<string, Date>();
      for (const r of rows) if (r.last) out.set(r.opportunityId, r.last);
      return out;
    },
    // The Bridge events feed: this user's events oldest first by created time
    // then id, no earlier than `since`, and strictly after the cursor tuple
    // when one is given. Created time is truncated to milliseconds on both
    // the order and the comparison, because a Date carries milliseconds and
    // the column carries microseconds: without it a cursor built from a Date
    // would sort just before its own row and return that row again.
    async listFeed(input: {
      since: Date;
      after: { createdAt: Date; id: string } | null;
      limit: number;
    }): Promise<FeedEventRow[]> {
      const createdMs = sql`date_trunc('milliseconds', ${schema.event.createdAt})`;
      const conditions = [eq(schema.event.userId, userId), gte(createdMs, sql`${input.since.toISOString()}::timestamptz`)];
      if (input.after) {
        conditions.push(
          sql`(${createdMs}, ${schema.event.id}) > (${input.after.createdAt.toISOString()}::timestamptz, ${input.after.id}::uuid)`,
        );
      }
      return db
        .select({
          id: schema.event.id,
          kind: schema.event.kind,
          slug: schema.opportunity.slug,
          stageLabel: schema.stage.label,
          occurredAt: schema.event.occurredAt,
          createdAt: schema.event.createdAt,
          body: schema.event.body,
          meta: schema.event.meta,
        })
        .from(schema.event)
        .innerJoin(
          schema.opportunity,
          and(eq(schema.opportunity.id, schema.event.opportunityId), eq(schema.opportunity.userId, userId)),
        )
        .leftJoin(schema.stage, and(eq(schema.stage.id, schema.event.stageId), eq(schema.stage.userId, userId)))
        .where(and(...conditions))
        .orderBy(asc(createdMs), asc(schema.event.id))
        .limit(input.limit);
    },
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
  };
}
