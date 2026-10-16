import { and, eq, inArray, isNotNull, sql } from "drizzle-orm";
import * as schema from "../schema";
import type { Db } from "../client";
import { stripScopedKeys } from "./strip";
import type { StageKind } from "@/lib/pipeline/kinds";
import type { StageFormat } from "@/lib/pipeline/values";

export type StageRow = typeof schema.stage.$inferSelect;
export type ScheduledStage = {
  id: string;
  opportunityId: string;
  kind: StageKind;
  label: string;
  scheduledAt: Date;
  format: StageFormat | null;
};
export type StageFields = Omit<
  typeof schema.stage.$inferInsert,
  "id" | "userId" | "createdAt" | "updatedAt"
>;

export function stageQueries(db: Db, userId: string) {
  return {
    async listAll(): Promise<StageRow[]> {
      return db
        .select()
        .from(schema.stage)
        .where(eq(schema.stage.userId, userId))
        .orderBy(schema.stage.opportunityId, schema.stage.position);
    },
    // Home reads every scheduled stage of an active job: one source for both
    // "interviews in the next 72 hours" and "a scheduled stage whose time has
    // passed". Closed jobs are left out here, not in the caller, so a closed
    // job's leftover scheduled stage can never surface on Home.
    async listScheduledForActive(): Promise<ScheduledStage[]> {
      const rows = await db
        .select({
          id: schema.stage.id,
          opportunityId: schema.stage.opportunityId,
          kind: schema.stage.kind,
          label: schema.stage.label,
          scheduledAt: schema.stage.scheduledAt,
          format: schema.stage.format,
        })
        .from(schema.stage)
        .innerJoin(
          schema.opportunity,
          and(eq(schema.opportunity.userId, userId), eq(schema.opportunity.id, schema.stage.opportunityId)),
        )
        .where(
          and(
            eq(schema.stage.userId, userId),
            eq(schema.stage.status, "scheduled"),
            eq(schema.opportunity.status, "active"),
            isNotNull(schema.stage.scheduledAt),
          ),
        );
      return rows.map((r) => ({ ...r, scheduledAt: r.scheduledAt! }));
    },
    async listForOpportunity(opportunityId: string): Promise<StageRow[]> {
      return db
        .select()
        .from(schema.stage)
        .where(and(eq(schema.stage.opportunityId, opportunityId), eq(schema.stage.userId, userId)))
        .orderBy(schema.stage.position);
    },
    async insert(values: StageFields): Promise<StageRow> {
      const fields = stripScopedKeys(values);
      const [row] = await db
        .insert(schema.stage)
        .values({ ...fields, userId })
        .returning();
      return row;
    },
    async insertMany(values: StageFields[]): Promise<StageRow[]> {
      if (values.length === 0) return [];
      const rows = values.map((v) => ({ ...stripScopedKeys(v), userId }));
      return db.insert(schema.stage).values(rows).returning();
    },
    async update(id: string, values: Partial<StageFields>): Promise<StageRow | null> {
      const fields = stripScopedKeys(values);
      const [row] = await db
        .update(schema.stage)
        .set({ ...fields, updatedAt: new Date() })
        .where(and(eq(schema.stage.id, id), eq(schema.stage.userId, userId)))
        .returning();
      return row ?? null;
    },
    async remove(id: string): Promise<StageRow | null> {
      const [row] = await db
        .delete(schema.stage)
        .where(and(eq(schema.stage.id, id), eq(schema.stage.userId, userId)))
        .returning();
      return row ?? null;
    },
    // A single `position = position + 1` update violates the
    // unique(opportunity_id, position) constraint the moment two rows' new
    // positions collide with each other's old ones. Two statements instead:
    // first move every row for this opportunity far out of the way, then set
    // each row to its final index in one bulk UPDATE ... CASE. Postgres
    // cannot always infer a bind parameter's type from its position inside a
    // CASE, so both the compared id and the assigned position need an
    // explicit cast, or PGlite defaults the expression to `text` and the
    // second statement fails against the integer `position` column.
    async renumber(opportunityId: string, orderedIds: string[]): Promise<void> {
      if (orderedIds.length === 0) return;

      await db
        .update(schema.stage)
        .set({ position: sql`${schema.stage.position} + 1000`, updatedAt: new Date() })
        .where(and(eq(schema.stage.userId, userId), eq(schema.stage.opportunityId, opportunityId)));

      const cases = orderedIds.map((id, index) => sql`when ${id}::uuid then ${index}::integer`);
      await db
        .update(schema.stage)
        .set({
          position: sql`(case ${schema.stage.id} ${sql.join(cases, sql` `)} end)`,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(schema.stage.userId, userId),
            eq(schema.stage.opportunityId, opportunityId),
            inArray(schema.stage.id, orderedIds),
          ),
        );
    },
  };
}
