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
    const pool = new Pool({ connectionString: env().DATABASE_URL });
    cached = createDb(pool);
  }
  return cached;
}
