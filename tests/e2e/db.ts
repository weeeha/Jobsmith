import { Pool } from "pg";

// A test-only way to change rows behind the app's back, for the specs that
// check a safety net. DATABASE_URL is the one the suite's own reset-db used.
function localPool(): Pool {
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
  return new Pool({ connectionString });
}

export async function deleteQuestionRows(slug: string): Promise<number> {
  const pool = localPool();
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

// A second account with one asset of its own, written behind the app's back, so a
// spec can ask the asset route for a real id that belongs to someone else. The
// object is not stored: the route must answer 404 before it ever looks.
export async function insertOtherUsersAsset(): Promise<string> {
  const pool = localPool();
  try {
    await pool.query(
      `insert into "user" (id, name, email) values ('e2e-other-user', 'Other', 'e2e-other@example.com')
       on conflict (id) do nothing`,
    );
    const key = `e2e-other/${crypto.randomUUID()}.mp3`;
    const result = await pool.query(
      `insert into asset (user_id, kind, storage_key, content_type, bytes, sha256)
       values ('e2e-other-user', 'tts_segment', $1, 'audio/mpeg', 10, 'e2e-not-a-real-hash') returning id`,
      [key],
    );
    return result.rows[0].id as string;
  } finally {
    await pool.end();
  }
}
