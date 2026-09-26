import { DrizzleQueryError } from "drizzle-orm";
import type { Extraction, Via } from "./values";
import type { FetchFailure } from "./fetch-guard";

export type IntakeLogLine = {
  requestId: string;
  outcome: "added" | "invalid" | "needs_text" | "needs_details" | "duplicate";
  via: Via | "manual" | null;
  extraction: Extraction | null;
  fetchFailure: FetchFailure | null;
  host: string | null;
  ms: number;
};

export function logIntake(line: IntakeLogLine): void {
  console.info("[intake]", JSON.stringify(line));
}

// Mirrors lib/bridge/handlers.ts's logBridgeError: the request id and the
// error's constructor name only, never a message. drizzle wraps every
// driver error in a DrizzleQueryError whose own message is the full SQL
// text plus every bound parameter, which for intake can be the posting text
// or pasted text itself - never worth risking in a log line.
export function logIntakeError(requestId: string, error: unknown): void {
  const name = error instanceof Error ? error.constructor.name : "UnknownError";
  if (error instanceof DrizzleQueryError) {
    const cause = error.cause as { code?: string; constraint?: string } | undefined;
    console.error("[intake]", requestId, name, { code: cause?.code, constraint: cause?.constraint });
    return;
  }
  console.error("[intake]", requestId, name);
}
