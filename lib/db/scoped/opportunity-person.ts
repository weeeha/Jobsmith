import { and, eq } from "drizzle-orm";
import * as schema from "../schema";
import type { Db } from "../client";
import { stripScopedKeys } from "./strip";
import type { PersonRole } from "@/lib/pipeline/values";
import type { PersonRow } from "./person";

export type OpportunityPersonRow = typeof schema.opportunityPerson.$inferSelect;
export type OpportunityPersonFields = Omit<
  typeof schema.opportunityPerson.$inferInsert,
  "id" | "userId" | "createdAt" | "updatedAt"
>;

export type LinkedPerson = {
  linkId: string;
  role: PersonRole;
  stageId: string | null;
  person: PersonRow;
};

export function opportunityPersonQueries(db: Db, userId: string) {
  return {
    async listForOpportunity(opportunityId: string): Promise<LinkedPerson[]> {
      const rows = await db
        .select({
          linkId: schema.opportunityPerson.id,
          role: schema.opportunityPerson.role,
          stageId: schema.opportunityPerson.stageId,
          person: schema.person,
        })
        .from(schema.opportunityPerson)
        .innerJoin(
          schema.person,
          and(eq(schema.person.id, schema.opportunityPerson.personId), eq(schema.person.userId, userId)),
        )
        .where(
          and(
            eq(schema.opportunityPerson.opportunityId, opportunityId),
            eq(schema.opportunityPerson.userId, userId),
          ),
        );

      return rows.map((r) => ({
        linkId: r.linkId,
        role: r.role as PersonRole,
        stageId: r.stageId,
        person: r.person,
      }));
    },
    // Named `link`, not `insert`, because the frame's produced interface
    // calls it that; the pattern (stripScopedKeys, userId appended last) is
    // otherwise identical to every other table's insert.
    async link(values: OpportunityPersonFields): Promise<OpportunityPersonRow> {
      const fields = stripScopedKeys(values);
      const [row] = await db
        .insert(schema.opportunityPerson)
        .values({ ...fields, userId })
        .returning();
      return row;
    },
    async update(
      id: string,
      values: Partial<OpportunityPersonFields>,
    ): Promise<OpportunityPersonRow | null> {
      const fields = stripScopedKeys(values);
      const [row] = await db
        .update(schema.opportunityPerson)
        .set({ ...fields, updatedAt: new Date() })
        .where(and(eq(schema.opportunityPerson.id, id), eq(schema.opportunityPerson.userId, userId)))
        .returning();
      return row ?? null;
    },
    async unlink(id: string): Promise<OpportunityPersonRow | null> {
      const [row] = await db
        .delete(schema.opportunityPerson)
        .where(and(eq(schema.opportunityPerson.id, id), eq(schema.opportunityPerson.userId, userId)))
        .returning();
      return row ?? null;
    },
  };
}
