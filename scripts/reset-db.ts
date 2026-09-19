import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { sql } from "drizzle-orm";
import { Pool } from "pg";
import path from "node:path";

async function main() {
  if (process.env.ALLOW_DB_RESET !== "true") {
    throw new Error("Refusing to reset: set ALLOW_DB_RESET=true to confirm.");
  }

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is required.");
  }

  const host = new URL(connectionString).hostname;
  if (host !== "localhost" && host !== "127.0.0.1") {
    throw new Error(
      `Refusing to reset a non-local database host: ${host}. This script only runs against localhost or 127.0.0.1.`,
    );
  }

  const pool = new Pool({ connectionString });
  const db = drizzle(pool);

  // drizzle-orm's node-postgres migrator tracks applied migrations in its own
  // "drizzle" schema, separate from "public". Both must be dropped together,
  // otherwise the migrator sees migration 0000 as already applied and skips
  // recreating the application tables.
  try {
    await db.execute(sql`DROP SCHEMA IF EXISTS public CASCADE`);
    await db.execute(sql`DROP SCHEMA IF EXISTS drizzle CASCADE`);
    await db.execute(sql`CREATE SCHEMA public`);

    await migrate(db, {
      migrationsFolder: path.resolve(import.meta.dirname, "../lib/db/migrations"),
    });
    console.log("Database reset and migrated.");
  } finally {
    // Close the pool on failure as well as success, same as scripts/migrate.ts.
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
