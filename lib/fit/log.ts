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
// database error, and nothing else. Drizzle wraps every driver error in a
// DrizzleQueryError whose message is the full SQL text and every bound
// parameter, which for a score write includes the summary and the model's
// words about the resume.
export function logFitError(error: unknown): void {
  const name = error instanceof Error ? error.constructor.name : "UnknownError";
  if (error instanceof DrizzleQueryError) {
    const cause = error.cause as { code?: string; constraint?: string } | undefined;
    console.error("[fit]", JSON.stringify({ error: name, code: cause?.code, constraint: cause?.constraint }));
    return;
  }
  console.error("[fit]", JSON.stringify({ error: name }));
}
