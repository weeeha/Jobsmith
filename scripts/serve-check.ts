import { pathToFileURL } from "node:url";
import { drizzle } from "drizzle-orm/node-postgres";
import { Client } from "pg";
import { env } from "@/lib/env";
import type { Db } from "@/lib/db/client";
import { aheadMessage, compareSchema, knownMigrationCount, readAppliedCount } from "@/lib/health/schema";

export type ServeCheckOptions = {
  // Loads and validates the pack registry. Left out while lib/packs does not
  // exist; milestone 33 passes the real loader from main().
  loadPacks?: () => Promise<unknown>;
  known?: number;
  log?: (line: string) => void;
};

// Returns the process exit code: 0 to go on serving, 1 to stop the start.
export async function serveCheck(db: Db, options: ServeCheckOptions = {}): Promise<number> {
  const log = options.log ?? ((line: string) => console.error(line));
  if (options.loadPacks) {
    try {
      await options.loadPacks();
    } catch (error) {
      // A broken pack stops the start, even though Next would keep serving.
      if (error instanceof Error && error.name === "PackError") {
        log(`PackError: ${error.message}`);
        return 1;
      }
      throw error;
    }
  }
  const applied = await readAppliedCount(db);
  const known = options.known ?? knownMigrationCount();
  if (compareSchema(applied, known) === "ahead") {
    log(aheadMessage(applied, known));
    return 1;
  }
  return 0;
}

async function main(): Promise<number> {
  const client = new Client({ connectionString: env().DATABASE_URL });
  await client.connect();
  try {
    return await serveCheck(drizzle(client) as unknown as Db);
  } finally {
    await client.end().catch(() => {});
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().then(
    (code) => process.exit(code),
    (error) => {
      console.error("[serve-check]", error instanceof Error ? error.message : String(error));
      process.exit(1);
    },
  );
}
