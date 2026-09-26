import { and, asc, desc, eq, like, sql } from "drizzle-orm";
import * as schema from "../schema";
import type { Db } from "../client";
import { stripScopedKeys } from "./strip";
import type { StageKind } from "@/lib/pipeline/kinds";
import type { ClosedReason, OpportunityStatus } from "@/lib/pipeline/values";

export type OpportunityRow = typeof schema.opportunity.$inferSelect;
export type OpportunityFields = Omit<
  typeof schema.opportunity.$inferInsert,
  "id" | "userId" | "createdAt" | "updatedAt"
>;

export type BoardCard = {
  id: string;
  slug: string;
  roleTitle: string;
  companyName: string;
  fitScore: number | null;
  nextAction: string | null;
  nextActionAt: Date | null;
  updatedAt: Date;
  stage: { id: string; kind: StageKind; label: string; enteredAt: Date | null };
};
export type ClosedCard = {
  id: string;
  slug: string;
  roleTitle: string;
  companyName: string;
  closedReason: ClosedReason;
  closedAt: Date;
  closedStageLabel: string | null;
};
export type OpportunitySummary = {
  slug: string;
  roleTitle: string;
  companyName: string;
  companyId: string;
  status: OpportunityStatus;
  stage: { kind: StageKind; label: string };
};

export function opportunityQueries(db: Db, userId: string) {
  return {
    async getById(id: string): Promise<OpportunityRow | null> {
      const [row] = await db
        .select()
        .from(schema.opportunity)
        .where(and(eq(schema.opportunity.id, id), eq(schema.opportunity.userId, userId)));
      return row ?? null;
    },
    async getBySlug(slug: string): Promise<OpportunityRow | null> {
      const [row] = await db
        .select()
        .from(schema.opportunity)
        .where(and(eq(schema.opportunity.slug, slug), eq(schema.opportunity.userId, userId)));
      return row ?? null;
    },
    // Only has locking effect when called on a transaction's own `tx`,
    // never on the top-level `db` — Scoped.transaction is what supplies that
    // `tx`, wrapped back into a Scoped so callers never see a raw
    // transaction handle.
    async lockById(id: string): Promise<OpportunityRow | null> {
      const [row] = await db
        .select()
        .from(schema.opportunity)
        .where(and(eq(schema.opportunity.id, id), eq(schema.opportunity.userId, userId)))
        .for("update");
      return row ?? null;
    },
    async listBoard(): Promise<BoardCard[]> {
      const rows = await db
        .select({
          id: schema.opportunity.id,
          slug: schema.opportunity.slug,
          roleTitle: schema.opportunity.roleTitle,
          companyName: schema.company.name,
          fitScore: schema.opportunity.fitScore,
          nextAction: schema.opportunity.nextAction,
          nextActionAt: schema.opportunity.nextActionAt,
          updatedAt: schema.opportunity.updatedAt,
          stageId: schema.stage.id,
          stageKind: schema.stage.kind,
          stageLabel: schema.stage.label,
          stageEnteredAt: schema.stage.enteredAt,
        })
        .from(schema.opportunity)
        .innerJoin(
          schema.company,
          and(eq(schema.company.userId, userId), eq(schema.company.id, schema.opportunity.companyId)),
        )
        .innerJoin(
          schema.stage,
          and(eq(schema.stage.userId, userId), eq(schema.stage.id, schema.opportunity.currentStageId)),
        )
        .where(and(eq(schema.opportunity.userId, userId), eq(schema.opportunity.status, "active")));

      return rows.map((r) => ({
        id: r.id,
        slug: r.slug,
        roleTitle: r.roleTitle,
        companyName: r.companyName,
        fitScore: r.fitScore,
        nextAction: r.nextAction,
        nextActionAt: r.nextActionAt,
        updatedAt: r.updatedAt,
        stage: { id: r.stageId, kind: r.stageKind as StageKind, label: r.stageLabel, enteredAt: r.stageEnteredAt },
      }));
    },
    // Mirrors listBoard's own join (company through user_id, filtered to
    // this user's active rows), but returns just what dedupe hashing needs:
    // no stage join, since an active job's stage is irrelevant to matching.
    async listActiveForDedupe(): Promise<
      { id: string; slug: string; roleTitle: string; location: string | null; companyName: string; createdAt: Date }[]
    > {
      const rows = await db
        .select({
          id: schema.opportunity.id,
          slug: schema.opportunity.slug,
          roleTitle: schema.opportunity.roleTitle,
          location: schema.opportunity.location,
          companyName: schema.company.name,
          createdAt: schema.opportunity.createdAt,
        })
        .from(schema.opportunity)
        .innerJoin(
          schema.company,
          and(eq(schema.company.userId, userId), eq(schema.company.id, schema.opportunity.companyId)),
        )
        .where(and(eq(schema.opportunity.userId, userId), eq(schema.opportunity.status, "active")))
        .orderBy(desc(schema.opportunity.createdAt));
      return rows;
    },
    async listClosed(): Promise<ClosedCard[]> {
      const rows = await db
        .select({
          id: schema.opportunity.id,
          slug: schema.opportunity.slug,
          roleTitle: schema.opportunity.roleTitle,
          companyName: schema.company.name,
          closedReason: schema.opportunity.closedReason,
          closedAt: schema.opportunity.closedAt,
          closedStageLabel: schema.stage.label,
        })
        .from(schema.opportunity)
        .innerJoin(
          schema.company,
          and(eq(schema.company.userId, userId), eq(schema.company.id, schema.opportunity.companyId)),
        )
        .leftJoin(
          schema.stage,
          and(eq(schema.stage.userId, userId), eq(schema.stage.id, schema.opportunity.closedStageId)),
        )
        .where(and(eq(schema.opportunity.userId, userId), eq(schema.opportunity.status, "closed")))
        .orderBy(desc(schema.opportunity.closedAt));

      return rows.map((r) => ({
        id: r.id,
        slug: r.slug,
        roleTitle: r.roleTitle,
        companyName: r.companyName,
        // Safe: opportunity_closed_consistency guarantees these are
        // non-null whenever status = 'closed', which this query already filters on.
        closedReason: r.closedReason as ClosedReason,
        closedAt: r.closedAt as Date,
        closedStageLabel: r.closedStageLabel,
      }));
    },
    // Every caller in this milestone passes a `prefix` already produced by
    // `baseSlug`: ASCII kebab-case, so it can never itself contain a `%` or
    // `_` wildcard character and needs no separate escaping step.
    // Drizzle's `like` binds `${prefix}%` as one parameter rather than
    // string-concatenating it into raw SQL.
    async listSlugsWithPrefix(prefix: string): Promise<string[]> {
      const rows = await db
        .select({ slug: schema.opportunity.slug })
        .from(schema.opportunity)
        .where(and(eq(schema.opportunity.userId, userId), like(schema.opportunity.slug, `${prefix}%`)));
      return rows.map((r) => r.slug);
    },
    // A plain equality on the lowercased column, not a pattern match: `ilike`
    // would treat `%`/`_` in a stored role as wildcards (e.g. "UX-UI
    // Designer" over-matching a lookup for "UX_UI Designer"). Multiple
    // historical (closed) opportunities can share a company and role
    // (re-applying a year later, spec 5.5); this returns only the most
    // recent match and leaves checking its `status` to `createOpportunity`.
    async findByCompanyAndRole(companyId: string, roleTitle: string): Promise<OpportunityRow | null> {
      const [row] = await db
        .select()
        .from(schema.opportunity)
        .where(
          and(
            eq(schema.opportunity.companyId, companyId),
            eq(schema.opportunity.userId, userId),
            sql`lower(${schema.opportunity.roleTitle}) = ${roleTitle.trim().toLowerCase()}`,
          ),
        )
        .orderBy(desc(schema.opportunity.createdAt))
        .limit(1);
      return row ?? null;
    },
    async listSlugsForCompany(companyId: string): Promise<string[]> {
      const rows = await db
        .select({ slug: schema.opportunity.slug })
        .from(schema.opportunity)
        .where(and(eq(schema.opportunity.userId, userId), eq(schema.opportunity.companyId, companyId)));
      return rows.map((r) => r.slug);
    },
    async listSummaries(status: "active" | "closed" | "all"): Promise<OpportunitySummary[]> {
      const rows = await db
        .select({
          slug: schema.opportunity.slug,
          roleTitle: schema.opportunity.roleTitle,
          companyName: schema.company.name,
          companyId: schema.opportunity.companyId,
          status: schema.opportunity.status,
          stageKind: schema.stage.kind,
          stageLabel: schema.stage.label,
        })
        .from(schema.opportunity)
        .innerJoin(
          schema.company,
          and(eq(schema.company.userId, userId), eq(schema.company.id, schema.opportunity.companyId)),
        )
        .innerJoin(
          schema.stage,
          and(eq(schema.stage.userId, userId), eq(schema.stage.id, schema.opportunity.currentStageId)),
        )
        .where(
          and(eq(schema.opportunity.userId, userId), status === "all" ? undefined : eq(schema.opportunity.status, status)),
        )
        .orderBy(asc(schema.company.name), asc(schema.opportunity.roleTitle));

      return rows.map((r) => ({
        slug: r.slug,
        roleTitle: r.roleTitle,
        companyName: r.companyName,
        companyId: r.companyId,
        status: r.status,
        stage: { kind: r.stageKind as StageKind, label: r.stageLabel },
      }));
    },
    async insert(values: OpportunityFields): Promise<OpportunityRow> {
      const fields = stripScopedKeys(values);
      const [row] = await db
        .insert(schema.opportunity)
        .values({ ...fields, userId })
        .returning();
      return row;
    },
    async update(id: string, values: Partial<OpportunityFields>): Promise<OpportunityRow | null> {
      const fields = stripScopedKeys(values);
      const [row] = await db
        .update(schema.opportunity)
        .set({ ...fields, updatedAt: new Date() })
        .where(and(eq(schema.opportunity.id, id), eq(schema.opportunity.userId, userId)))
        .returning();
      return row ?? null;
    },
  };
}
