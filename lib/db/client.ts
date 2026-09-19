import { drizzle } from "drizzle-orm/node-postgres";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { Pool } from "pg";
import { env } from "@/lib/env";
import * as schema from "./schema";

// Shared shape both the node-postgres driver (Neon, self-hosted Postgres) and
// the PGlite driver (tests) satisfy, so every lib/db function accepts either
// without depending on either driver's concrete type.
export type Db = PgDatabase<PgQueryResultHKT, typeof schema>;

export function createDb(pool: Pool): Db {
  return drizzle(pool, { schema });
}

let cached: Db | undefined;

export function getDb(): Db {
  if (!cached) {
    // A serverless/edge-adjacent deployment can run many instances of this
    // app at once, each with its own pool; a small per-instance ceiling
    // (max) keeps the fleet from overwhelming Postgres's own connection
    // limit, and a short idle timeout releases connections between bursts
    // of traffic instead of holding them open unused.
    const pool = new Pool({
      connectionString: env().DATABASE_URL,
      max: 5,
      idleTimeoutMillis: 10_000,
    });
    cached = createDb(pool);
  }
  return cached;
}
