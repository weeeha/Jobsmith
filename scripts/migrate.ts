import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Client, Pool } from "pg";
import path from "node:path";

// Fixed and arbitrary: derived once from sha256("jobsmith:migrate-advisory-lock")
// and truncated to 48 bits (comfortably inside both a JS safe integer and a
// Postgres bigint). It must never change — every process running this
// script has to ask for the same key, or two builds racing to migrate the
// same database would no longer serialize against each other.
const MIGRATION_LOCK_KEY = 117642082805122;

async function main() {
  // Hosted Postgres providers (Neon, Supabase, ...) hand out a pooled URL,
  // often through something like PgBouncer in transaction mode, whose
  // connections are not guaranteed to stay on the same backend session
  // between statements. pg_advisory_lock/unlock are session-scoped, so
  // migrations need the direct connection: DATABASE_URL_UNPOOLED when it is
  // set, DATABASE_URL otherwise (e.g. the local docker-compose Postgres,
  // which is not pooled at all).
  const connectionString = process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is required to run migrations");
  }

  // One dedicated client (not the pool below) holds the advisory lock for
  // the whole run: pg_advisory_lock and pg_advisory_unlock must run on the
  // exact same backend connection, not just the same pool.
  const lockClient = new Client({ connectionString });
  await lockClient.connect();

  const pool = new Pool({ connectionString });

  try {
    // Blocks until any other process holding this key releases it, rather
    // than failing outright — two builds started at the same moment both
    // still exit 0, one just waits for the other to finish migrating first.
    await lockClient.query("SELECT pg_advisory_lock($1)", [MIGRATION_LOCK_KEY]);

    const db = drizzle(pool);
    await migrate(db, {
      migrationsFolder: path.resolve(import.meta.dirname, "../lib/db/migrations"),
    });
    console.log("Migrations applied");
  } finally {
    // Ending the session releases the lock as well, so a failed unlock (for
    // example on a connection that already dropped) is ignored here: it must
    // not replace the error that brought us into this block.
    await lockClient.query("SELECT pg_advisory_unlock($1)", [MIGRATION_LOCK_KEY]).catch(() => {});
    await lockClient.end().catch(() => {});
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
