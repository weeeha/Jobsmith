import { Pool } from "pg";
import { createDb } from "@/lib/db/client";
import { scoped } from "@/lib/db/scoped";
import { user } from "@/lib/db/schema";
import { backfillPrep } from "@/lib/prep/backfill";

// Hand-run only, never part of a migration or the build command: it rebuilds
// question rows from the stored documents of jobs that predate Prep.
class UsageError extends Error {}

function parseArgs(argv: string[]): { email?: string; dryRun: boolean } {
  const dryRun = argv.includes("--dry-run");
  const emailIndex = argv.indexOf("--email");
  const email = emailIndex === -1 ? undefined : argv[emailIndex + 1];
  if (emailIndex !== -1 && !email) {
    throw new UsageError("Usage: pnpm prep:backfill [--email <address>] [--dry-run]");
  }
  return { email, dryRun };
}

async function main() {
  const { email, dryRun } = parseArgs(process.argv.slice(2));

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error("DATABASE_URL is required.");
    process.exit(1);
  }

  const pool = new Pool({ connectionString });
  const db = createDb(pool);

  try {
    const users = await db.select({ id: user.id, email: user.email }).from(user);
    const chosen = email ? users.filter((u) => u.email === email) : users;
    if (email && chosen.length === 0) throw new UsageError(`No user with email ${email}.`);

    for (const u of chosen) {
      const summary = await backfillPrep(scoped(db, u.id), { dryRun });
      console.log(
        `${dryRun ? "[dry run] " : ""}${u.email}: Rebuilt ${summary.questions} questions from ${summary.documents} documents in ${summary.jobs} jobs.`,
      );
    }
  } finally {
    // This script opened the pool, so it closes it.
    await pool.end();
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error instanceof UsageError ? error.message : error);
    process.exit(1);
  });
