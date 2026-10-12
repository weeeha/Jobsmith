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
