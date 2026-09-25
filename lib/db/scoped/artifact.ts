import { and, asc, desc, eq, getTableColumns } from "drizzle-orm";
import * as schema from "../schema";
import type { Db } from "../client";
import { stripScopedKeys } from "./strip";

export type ArtifactRow = typeof schema.artifact.$inferSelect;
export type ArtifactFields = Omit<typeof schema.artifact.$inferInsert, "id" | "userId" | "createdAt" | "updatedAt">;
export type ArtifactMeta = Omit<ArtifactRow, "bodyMd" | "userId">;
export type ArtifactScopeRef = { opportunityId: string } | { companyId: string };

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
  };
}
