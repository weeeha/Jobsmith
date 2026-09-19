import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import path from "node:path";
import * as schema from "@/lib/db/schema";
import type { Db } from "@/lib/db/client";

export async function makeTestDb(): Promise<{ db: Db; client: PGlite; close(): Promise<void> }> {
  const client = new PGlite();
  const db = drizzle(client, { schema });

  await migrate(db, {
    migrationsFolder: path.resolve(__dirname, "../../lib/db/migrations"),
  });

  return {
    db,
    client,
    close: () => client.close(),
  };
}

export async function createTestUser(
  db: Db,
  email: string,
): Promise<{ id: string; email: string }> {
  const [row] = await db
    .insert(schema.user)
    .values({ id: crypto.randomUUID(), name: email, email, emailVerified: false })
    .returning({ id: schema.user.id, email: schema.user.email });
  return row;
}
