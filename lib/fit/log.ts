import { DrizzleQueryError } from "drizzle-orm";
import type { AiErrorCode } from "@/lib/ai/driver";
import type { FitReadiness } from "./readiness";

// One line per scoring run. Ids, codes, the model id, durations and token
// counts only: never posting text, resume text, preferences or summaries.
export type FitLogLine = {
  opportunityId: string | null;
  outcome: "done" | "failed" | "none" | "test";
  reason: FitReadiness | AiErrorCode | null;
  modelId: string | null;
  ms: number;
  inputTokens: number | null;
  outputTokens: number | null;
};

export function logFit(line: FitLogLine): void {
  console.info("[fit]", JSON.stringify(line));
}

// The error's constructor name, plus the Postgres code and constraint for a
// database error, never a message. Drizzle's own message is the SQL text
// with every bound parameter, which for a fit write is the resume-based
// summary; Next's after() reporting would print the whole object, so a
// scoring run catches everything and logs it here instead.
export function logFitError(opportunityId: string | null, error: unknown): void {
  const name = error instanceof Error ? error.constructor.name : "UnknownError";
  const line: Record<string, string | null | undefined> = { opportunityId, error: name };
  if (error instanceof DrizzleQueryError) {
    const cause = error.cause as { code?: string; constraint?: string } | undefined;
    line.code = cause?.code;
    line.constraint = cause?.constraint;
  }
  console.error("[fit]", JSON.stringify(line));
}
