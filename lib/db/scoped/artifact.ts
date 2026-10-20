import { and, asc, desc, eq, getTableColumns, inArray, or, sql } from "drizzle-orm";
import * as schema from "../schema";
import type { Db } from "../client";
import type { ArtifactKind } from "@/lib/artifacts/kinds";
import { stripScopedKeys } from "./strip";

export type ArtifactRow = typeof schema.artifact.$inferSelect;
export type ArtifactFields = Omit<typeof schema.artifact.$inferInsert, "id" | "userId" | "createdAt" | "updatedAt">;
export type ArtifactMeta = Omit<ArtifactRow, "bodyMd" | "userId">;
export type ArtifactScopeRef = { opportunityId: string } | { companyId: string };
export type RecentPush = {
  id: string;
  key: string;
  title: string;
  kind: ArtifactRow["kind"];
  createdAt: Date;
  companyName: string;
  job: { slug: string; roleTitle: string } | null;
  // A company-wide document opens through any job at that company, the same
  // way the Companies page links its research; null when the company has none.
  companyJobSlug: string | null;
};

function scopeCondition(ref: ArtifactScopeRef) {
  return "opportunityId" in ref
    ? eq(schema.artifact.opportunityId, ref.opportunityId)
    : eq(schema.artifact.companyId, ref.companyId);
}

export function artifactQueries(db: Db, userId: string) {
  // getTableColumns(...) returns a plain column map; destructuring off two
  // keys is enough to turn it into a valid `.select()` argument that leaves
  // out bodyMd and userId from every list-shaped read below.
  const { bodyMd: _bodyMd, userId: _userId, ...metaColumns } = getTableColumns(schema.artifact);
  void _bodyMd;
  void _userId;

  return {
    async listLatestForOpportunity(opportunityId: string): Promise<ArtifactMeta[]> {
      return db
        .selectDistinctOn([schema.artifact.key], metaColumns)
        .from(schema.artifact)
        .where(and(eq(schema.artifact.userId, userId), eq(schema.artifact.opportunityId, opportunityId)))
        .orderBy(schema.artifact.key, desc(schema.artifact.version));
    },
    async listLatestForCompany(companyId: string): Promise<ArtifactMeta[]> {
      return db
        .selectDistinctOn([schema.artifact.key], metaColumns)
        .from(schema.artifact)
        .where(and(eq(schema.artifact.userId, userId), eq(schema.artifact.companyId, companyId)))
        .orderBy(schema.artifact.key, desc(schema.artifact.version));
    },
    async listVersions(ref: ArtifactScopeRef, key: string): Promise<ArtifactMeta[]> {
      return db
        .select(metaColumns)
        .from(schema.artifact)
        .where(and(eq(schema.artifact.userId, userId), scopeCondition(ref), eq(schema.artifact.key, key)))
        .orderBy(asc(schema.artifact.version));
    },
    async getVersion(ref: ArtifactScopeRef, key: string, version: number): Promise<ArtifactRow | null> {
      const [row] = await db
        .select()
        .from(schema.artifact)
        .where(
          and(
            eq(schema.artifact.userId, userId),
            scopeCondition(ref),
            eq(schema.artifact.key, key),
            eq(schema.artifact.version, version),
          ),
        );
      return row ?? null;
    },
    async getLatest(ref: ArtifactScopeRef, key: string): Promise<ArtifactRow | null> {
      const [row] = await db
        .select()
        .from(schema.artifact)
        .where(and(eq(schema.artifact.userId, userId), scopeCondition(ref), eq(schema.artifact.key, key)))
        .orderBy(desc(schema.artifact.version))
        .limit(1);
      return row ?? null;
    },
    async listKeys(ref: ArtifactScopeRef): Promise<string[]> {
      const rows = await db
        .selectDistinct({ key: schema.artifact.key })
        .from(schema.artifact)
        .where(and(eq(schema.artifact.userId, userId), scopeCondition(ref)));
      return rows.map((r) => r.key);
    },
    async insert(values: ArtifactFields): Promise<ArtifactRow> {
      const fields = stripScopedKeys(values);
      const [row] = await db
        .insert(schema.artifact)
        .values({ ...fields, userId })
        .returning();
      return row;
    },
    async update(id: string, values: Partial<ArtifactFields>): Promise<ArtifactRow | null> {
      const fields = stripScopedKeys(values);
      const [row] = await db
        .update(schema.artifact)
        .set({ ...fields, updatedAt: new Date() })
        .where(and(eq(schema.artifact.id, id), eq(schema.artifact.userId, userId)))
        .returning();
      return row ?? null;
    },
    // Every version of every document, bodies included, for "Export my data".
    async listAll(): Promise<ArtifactRow[]> {
      return db
        .select()
        .from(schema.artifact)
        .where(eq(schema.artifact.userId, userId))
        .orderBy(asc(schema.artifact.createdAt));
    },
    // The jobs with at least one document of these kinds, their own or shared
    // by their company, for Home to tell which interviews still need research.
    async opportunityIdsWithKinds(kinds: readonly ArtifactKind[]): Promise<Set<string>> {
      const rows = await db
        .selectDistinct({ id: schema.opportunity.id })
        .from(schema.opportunity)
        .innerJoin(
          schema.artifact,
          and(
            eq(schema.artifact.userId, userId),
            inArray(schema.artifact.kind, [...kinds]),
            or(
              eq(schema.artifact.opportunityId, schema.opportunity.id),
              eq(schema.artifact.companyId, schema.opportunity.companyId),
            ),
          ),
        )
        .where(eq(schema.opportunity.userId, userId));
      return new Set(rows.map((r) => r.id));
    },
    // The newest versions that arrived through the bridge, newest first, with
    // what Home needs to say where each one landed. A company-wide document
    // has no job, so its company comes through the artifact's own column.
    async listRecentPushed(limit: number): Promise<RecentPush[]> {
      const rows = await db
        .select({
          id: schema.artifact.id,
          key: schema.artifact.key,
          title: schema.artifact.title,
          kind: schema.artifact.kind,
          createdAt: schema.artifact.createdAt,
          slug: schema.opportunity.slug,
          roleTitle: schema.opportunity.roleTitle,
          companyName: schema.company.name,
          companyJobSlug: sql<string | null>`(
            select o.slug from ${schema.opportunity} o
            where o.user_id = ${userId} and o.company_id = ${schema.artifact.companyId}
            order by o.created_at desc limit 1
          )`,
        })
        .from(schema.artifact)
        .leftJoin(
          schema.opportunity,
          and(eq(schema.opportunity.userId, userId), eq(schema.opportunity.id, schema.artifact.opportunityId)),
        )
        .innerJoin(
          schema.company,
          and(
            eq(schema.company.userId, userId),
            eq(schema.company.id, sql`coalesce(${schema.artifact.companyId}, ${schema.opportunity.companyId})`),
          ),
        )
        .where(and(eq(schema.artifact.userId, userId), eq(schema.artifact.origin, "pushed")))
        .orderBy(desc(schema.artifact.createdAt), desc(schema.artifact.version))
        .limit(limit);
      return rows.map((r) => ({
        id: r.id,
        key: r.key,
        title: r.title,
        kind: r.kind,
        createdAt: r.createdAt,
        companyName: r.companyName,
        job: r.slug && r.roleTitle ? { slug: r.slug, roleTitle: r.roleTitle } : null,
        companyJobSlug: r.slug ? null : r.companyJobSlug,
      }));
    },
  };
}
