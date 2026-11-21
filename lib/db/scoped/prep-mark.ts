import { and, asc, eq, isNull, sql } from "drizzle-orm";
import * as schema from "../schema";
import type { Db } from "../client";
import type { MarkLevel, MarkScope } from "@/lib/prep/values";

export type PrepMarkRow = typeof schema.prepMark.$inferSelect;

export type ApplyMarkInput = {
  scope: MarkScope;
  opportunityId: string | null;
  questionKey: string;
  level: MarkLevel;
  markedAt: Date;
  drilled: boolean;
};

type RawMarkRow = {
  id: string;
  user_id: string;
  scope: MarkScope;
  opportunity_id: string | null;
  question_key: string;
  level: MarkLevel;
  marked_at: Date | string;
  drill_count: number | string;
  last_drilled_at: Date | string | null;
  created_at: Date | string;
  updated_at: Date | string;
};

function toRow(raw: RawMarkRow): PrepMarkRow {
  return {
    id: raw.id,
    userId: raw.user_id,
    scope: raw.scope,
    opportunityId: raw.opportunity_id,
    questionKey: raw.question_key,
    level: raw.level,
    markedAt: new Date(raw.marked_at),
    drillCount: Number(raw.drill_count),
    lastDrilledAt: raw.last_drilled_at === null ? null : new Date(raw.last_drilled_at),
    createdAt: new Date(raw.created_at),
    updatedAt: new Date(raw.updated_at),
  };
}

export function prepMarkQueries(db: Db, userId: string) {
  const table = schema.prepMark;
  return {
    async listForJob(opportunityId: string): Promise<PrepMarkRow[]> {
      return db
        .select()
        .from(table)
        .where(and(eq(table.userId, userId), eq(table.scope, "job"), eq(table.opportunityId, opportunityId)));
    },
    async listLibrary(): Promise<PrepMarkRow[]> {
      return db
        .select()
        .from(table)
        .where(and(eq(table.userId, userId), eq(table.scope, "library")))
        .orderBy(asc(table.questionKey));
    },
    // Every scope: the history of one question across jobs and the library.
    async listForQuestionKey(questionKey: string): Promise<PrepMarkRow[]> {
      return db
        .select()
        .from(table)
        .where(and(eq(table.userId, userId), eq(table.questionKey, questionKey)))
        .orderBy(asc(table.markedAt));
    },
    async find(
      scope: MarkScope,
      opportunityId: string | null,
      questionKey: string,
    ): Promise<PrepMarkRow | null> {
      const [row] = await db
        .select()
        .from(table)
        .where(
          and(
            eq(table.userId, userId),
            eq(table.scope, scope),
            opportunityId === null ? isNull(table.opportunityId) : eq(table.opportunityId, opportunityId),
            eq(table.questionKey, questionKey),
          ),
        );
      return row ?? null;
    },
    // The only write path for a mark. One statement, so the conflict rule
    // (the newer marked_at keeps its level) holds under concurrent writers.
    async applyMark(input: ApplyMarkInput): Promise<{ row: PrepMarkRow; applied: boolean }> {
      const markedAt = input.markedAt.toISOString();
      const result = await db.execute(sql`
        insert into prep_mark (user_id, scope, opportunity_id, question_key, level, marked_at, drill_count, last_drilled_at)
        values (
          ${userId}, ${input.scope}, ${input.opportunityId}::uuid, ${input.questionKey}, ${input.level},
          ${markedAt}::timestamptz,
          case when ${input.drilled}::boolean then 1 else 0 end,
          case when ${input.drilled}::boolean then ${markedAt}::timestamptz end
        )
        on conflict (user_id, scope, (coalesce(opportunity_id::text, '')), question_key) do update set
          level = case when excluded.marked_at > prep_mark.marked_at then excluded.level else prep_mark.level end,
          marked_at = greatest(prep_mark.marked_at, excluded.marked_at),
          drill_count = prep_mark.drill_count + excluded.drill_count,
          last_drilled_at = greatest(prep_mark.last_drilled_at, excluded.last_drilled_at),
          updated_at = now()
        returning *
      `);
      const raw = (result as unknown as { rows: RawMarkRow[] }).rows[0];
      const row = toRow(raw);
      return { row, applied: row.markedAt.getTime() === input.markedAt.getTime() };
    },
    // Job-scope levels by job then question key, for Home.
    async levelsByOpportunity(): Promise<Map<string, Map<string, MarkLevel>>> {
      const rows = await db
        .select({ opportunityId: table.opportunityId, questionKey: table.questionKey, level: table.level })
        .from(table)
        .where(and(eq(table.userId, userId), eq(table.scope, "job")));
      const out = new Map<string, Map<string, MarkLevel>>();
      for (const r of rows) {
        if (r.opportunityId === null) continue;
        let inner = out.get(r.opportunityId);
        if (!inner) {
          inner = new Map();
          out.set(r.opportunityId, inner);
        }
        inner.set(r.questionKey, r.level);
      }
      return out;
    },
    async listAll(): Promise<PrepMarkRow[]> {
      return db
        .select()
        .from(table)
        .where(eq(table.userId, userId))
        .orderBy(asc(table.createdAt));
    },
  };
}
