import { and, eq } from "drizzle-orm";
import * as schema from "../schema";
import type { Db } from "../client";
import { stripScopedKeys } from "./strip";

export type PersonRow = typeof schema.person.$inferSelect;
export type PersonFields = Omit<
  typeof schema.person.$inferInsert,
  "id" | "userId" | "createdAt" | "updatedAt"
>;

export function personQueries(db: Db, userId: string) {
  return {
    async getById(id: string): Promise<PersonRow | null> {
      const [row] = await db
        .select()
        .from(schema.person)
        .where(and(eq(schema.person.id, id), eq(schema.person.userId, userId)));
      return row ?? null;
    },
    async listForCompany(companyId: string): Promise<PersonRow[]> {
      return db
        .select()
        .from(schema.person)
        .where(and(eq(schema.person.companyId, companyId), eq(schema.person.userId, userId)))
        .orderBy(schema.person.name);
    },
    async insert(values: PersonFields): Promise<PersonRow> {
      const fields = stripScopedKeys(values);
      const [row] = await db
        .insert(schema.person)
        .values({ ...fields, userId })
        .returning();
      return row;
    },
    async update(id: string, values: Partial<PersonFields>): Promise<PersonRow | null> {
      const fields = stripScopedKeys(values);
      const [row] = await db
        .update(schema.person)
        .set({ ...fields, updatedAt: new Date() })
        .where(and(eq(schema.person.id, id), eq(schema.person.userId, userId)))
        .returning();
      return row ?? null;
    },
  };
}
