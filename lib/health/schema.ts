import { sql } from "drizzle-orm";
import type { Db } from "@/lib/db/client";
import journal from "@/lib/db/migrations/meta/_journal.json";

export type SchemaState = "current" | "pending" | "ahead";

export function compareSchema(applied: number, known: number): SchemaState {
  if (applied === known) return "current";
  return applied < known ? "pending" : "ahead";
}

// Rows in drizzle's own bookkeeping table. A missing table or schema (a
// database nobody has migrated yet) counts as zero applied migrations.
export async function readAppliedCount(db: Db): Promise<number> {
  try {
    const result = (await db.execute(
      sql`select count(*)::int as n from drizzle.__drizzle_migrations`,
    )) as { rows: Array<{ n?: number | string }> };
    const row = result.rows[0];
    return Number(row?.n ?? 0);
  } catch {
    return 0;
  }
}

// The journal is imported as a module, so a standalone build traces it
// without an extra file.
export function knownMigrationCount(): number {
  return journal.entries.length;
}

export function aheadMessage(applied: number, known: number): string {
  return `Database schema is newer than this version (applied ${applied}, known ${known}). Restore a backup or run a newer image.`;
}
