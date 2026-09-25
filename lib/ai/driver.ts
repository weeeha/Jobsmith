import type { z } from "zod";
import type { Result } from "@/lib/result";
import type { AiProvider } from "./config";

export const AI_TASKS = ["extract_posting"] as const;
export type AiTask = (typeof AI_TASKS)[number];

export type AiErrorCode = "ai_timeout" | "ai_bad_output" | "ai_error";
export type AiUsage = { inputTokens: number | null; outputTokens: number | null };

export type AiRequest<T> = {
  task: AiTask;
  schema: z.ZodType<T>;
  instructions: string;
  prompt: string;
  maxOutputTokens: number;
  timeoutMs: number;
  userId: string;
};

export type AiResponse<T> = { object: T; modelId: string; usage: AiUsage };

export interface AiDriver {
  readonly name: AiProvider;
  readonly modelId: string;
  generate<T>(request: AiRequest<T>): Promise<Result<AiResponse<T>, AiErrorCode>>;
}
