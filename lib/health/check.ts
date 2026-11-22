import { sql } from "drizzle-orm";
import type { Db } from "@/lib/db/client";
import { compareSchema, readAppliedCount, type SchemaState } from "./schema";

export type HealthBody = {
  status: "ok" | "down";
  version: string;
  checks: { database: "ok" | "down"; schema: SchemaState };
};

const STATEMENT_TIMEOUT_MS = 1500;

export async function runHealth(
  db: Db,
  journalCount: number,
  version: string,
): Promise<HealthBody> {
  let database: "ok" | "down" = "ok";
  let failure: unknown;
  try {
    await db.transaction(async (tx) => {
      await tx.execute(sql.raw(`set local statement_timeout = ${STATEMENT_TIMEOUT_MS}`));
      await tx.execute(sql`select 1`);
    });
  } catch (error) {
    database = "down";
    failure = error;
  }

  // With the database unreachable the schema cannot be read; "pending" is the
  // neutral value, the database check already carries the failure.
  let schema: SchemaState = "pending";
  if (database === "ok") {
    schema = compareSchema(await readAppliedCount(db), journalCount);
  }

  const ok = database === "ok" && schema === "current";
  if (!ok) {
    const code = (failure as { code?: string } | undefined)?.code ?? null;
    console.error("health check failed", { database, schema, code });
  }
  return { status: ok ? "ok" : "down", version, checks: { database, schema } };
}
