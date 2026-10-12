import { DrizzleQueryError } from "drizzle-orm";

// The error's constructor name, plus the Postgres code and constraint for a
// database error, and nothing else. Drizzle wraps every driver error in a
// DrizzleQueryError whose message is the full SQL text and every bound
// parameter, which can be a resume, a headline, a preference value or a
// model's words about the resume. `extra` carries ids the caller already
// holds, never text from the user.
export function logDbErrorSafely(tag: string, extra: Record<string, string>, error: unknown): void {
  const name = error instanceof Error ? error.constructor.name : "UnknownError";
  if (error instanceof DrizzleQueryError) {
    const cause = error.cause as { code?: string; constraint?: string } | undefined;
    console.error(tag, JSON.stringify({ ...extra, error: name, code: cause?.code, constraint: cause?.constraint }));
    return;
  }
  console.error(tag, JSON.stringify({ ...extra, error: name }));
}
