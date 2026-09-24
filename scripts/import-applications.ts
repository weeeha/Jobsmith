import { readFileSync } from "node:fs";
import path from "node:path";
import { Pool } from "pg";
import { createDb } from "@/lib/db/client";
import { scoped } from "@/lib/db/scoped";
import { user } from "@/lib/db/schema";
import { parseApplications, importApplications } from "@/lib/import/applications";

// A usage mistake (bad flags, no matching account), not a bug: raised inside
// the try below so the pool still closes through `finally`, then caught by
// main().catch, which prints only its message — no stack trace — to keep
// that distinct from an unexpected failure.
class UsageError extends Error {}

function parseArgs(argv: string[]): { file: string; email?: string; dryRun: boolean } {
  const dryRun = argv.includes("--dry-run");
  const emailIndex = argv.indexOf("--email");
  const email = emailIndex === -1 ? undefined : argv[emailIndex + 1];
  const file = argv.find((arg, i) => {
    if (arg.startsWith("--")) return false;
    if (i > 0 && argv[i - 1] === "--email") return false;
    return true;
  });
  if (!file) {
    throw new Error("Usage: pnpm import:applications <file> [--email <address>] [--dry-run]");
  }
  return { file, email, dryRun };
}

async function main() {
  const { file, email, dryRun } = parseArgs(process.argv.slice(2));

  const raw = readFileSync(path.resolve(process.cwd(), file), "utf8");
  const parsed = parseApplications(JSON.parse(raw));
  if (!parsed.ok) {
    console.error(`Could not read ${file}: ${parsed.message}`);
    process.exit(1);
  }

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error("DATABASE_URL is required.");
    process.exit(1);
  }

  const pool = new Pool({ connectionString });
  const db = createDb(pool);

  try {
    const users = await db.select({ id: user.id, email: user.email }).from(user);

    let chosen: { id: string; email: string };
    if (email) {
      const match = users.find((u) => u.email === email);
      if (!match) {
        throw new UsageError(`No user with email ${email}.`);
      }
      chosen = match;
    } else if (users.length === 1) {
      chosen = users[0]!;
    } else if (users.length === 0) {
      throw new UsageError("No users exist yet. Create an account first.");
    } else {
      throw new UsageError("Multiple accounts exist; pass --email <address>.");
    }

    const s = scoped(db, chosen.id);
    const summary = await importApplications(s, parsed.data, { dryRun });

    console.log(`${dryRun ? "[dry run] " : ""}Imported for ${chosen.email}:`);
    console.log(`  created: ${summary.created}`);
    console.log(`  skipped (already tracked): ${summary.skipped}`);
    console.log(`  failed: ${summary.failed.length}`);
    for (const failure of summary.failed) {
      console.log(`    [${failure.index}] ${failure.message}`);
    }
  } finally {
    // createDb's Pool is opened by this script, not shared, so it is this
    // script's job to close it — otherwise the open pool holds the process
    // past the point the work is done, the same reason scripts/migrate.ts
    // and scripts/reset-db.ts close their own pools in finally.
    await pool.end();
  }
}

// Closing the pool above stops it from keeping the process alive, but exit
// explicitly on both paths anyway, the same way scripts/seed.ts does.
main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error instanceof UsageError ? error.message : error);
    process.exit(1);
  });
