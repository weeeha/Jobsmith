import { and, eq } from "drizzle-orm";
import * as schema from "../schema";
import type { Db } from "../client";
import { stripScopedKeys } from "./strip";

export type CompanyRow = typeof schema.company.$inferSelect;
export type CompanyFields = Omit<
  typeof schema.company.$inferInsert,
  "id" | "userId" | "createdAt" | "updatedAt"
>;

export function companyQueries(db: Db, userId: string) {
  return {
    async getById(id: string): Promise<CompanyRow | null> {
      const [row] = await db
        .select()
        .from(schema.company)
        .where(and(eq(schema.company.id, id), eq(schema.company.userId, userId)));
      return row ?? null;
    },
    async findByNameKey(nameKey: string): Promise<CompanyRow | null> {
      const [row] = await db
        .select()
        .from(schema.company)
        .where(and(eq(schema.company.nameKey, nameKey), eq(schema.company.userId, userId)));
      return row ?? null;
    },
    async list(): Promise<CompanyRow[]> {
      return db
        .select()
        .from(schema.company)
        .where(eq(schema.company.userId, userId))
        .orderBy(schema.company.name);
    },
    async insert(values: CompanyFields): Promise<CompanyRow> {
      const fields = stripScopedKeys(values);
      const [row] = await db
        .insert(schema.company)
        .values({ ...fields, userId })
        .returning();
      return row;
    },
    async update(id: string, values: Partial<CompanyFields>): Promise<CompanyRow | null> {
      const fields = stripScopedKeys(values);
      const [row] = await db
        .update(schema.company)
        .set({ ...fields, updatedAt: new Date() })
        .where(and(eq(schema.company.id, id), eq(schema.company.userId, userId)))
        .returning();
      return row ?? null;
    },
  };
}
