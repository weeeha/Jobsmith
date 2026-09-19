import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";
import path from "node:path";

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is required to run migrations");
  }

  const pool = new Pool({ connectionString });
  const db = drizzle(pool);

  try {
    await migrate(db, {
      migrationsFolder: path.resolve(import.meta.dirname, "../lib/db/migrations"),
    });
    console.log("Migrations applied");
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
