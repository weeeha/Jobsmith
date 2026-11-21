import { Pool } from "pg";

// A test-only way to change rows behind the app's back, for the specs that
// check a safety net. DATABASE_URL is the one the suite's own reset-db used.
export async function deleteQuestionRows(slug: string): Promise<number> {
  // Playwright does not read .env; the app and the reset script do, so read it
  // the same way when the shell did not set DATABASE_URL.
  if (!process.env.DATABASE_URL) {
    try {
      process.loadEnvFile(".env");
    } catch {
      // No .env: fall through to the local default below.
    }
  }
  const connectionString = process.env.DATABASE_URL ?? "postgres://postgres:postgres@localhost:5432/jobsmith";
  const host = new URL(connectionString).hostname;
  if (host !== "localhost" && host !== "127.0.0.1") {
    throw new Error(`Refusing to touch a non-local database host: ${host}.`);
  }
  const pool = new Pool({ connectionString });
  try {
    const result = await pool.query(
      "delete from prep_question where opportunity_id in (select id from opportunity where slug = $1)",
      [slug],
    );
    return result.rowCount ?? 0;
  } finally {
    await pool.end();
  }
}
