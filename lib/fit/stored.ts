import { z } from "zod";
import type { FitResult } from "@/lib/ai/score-fit";

export const FIT_VERSION = 1;

// What the opportunity's `fit` column holds. The version lets a later change
// to the shape tell old documents from new ones.
export const storedFitSchema = z.object({
  v: z.literal(FIT_VERSION),
  score: z.number().int().min(0).max(100),
  summary: z.string().min(1).max(300),
  pros: z.array(z.string().min(1).max(200)).max(3),
  cons: z.array(z.string().min(1).max(200)).max(3),
  modelId: z.string().min(1).max(100),
  scoredAt: z.iso.datetime(),
});
export type StoredFit = z.infer<typeof storedFitSchema>;

// Anything that does not parse is treated as "no stored fit"; a page never
// fails on it.
export function parseStoredFit(raw: unknown): StoredFit | null {
  const parsed = storedFitSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

export function toStoredFit(result: FitResult, modelId: string, scoredAt: Date): StoredFit {
  return {
    v: FIT_VERSION,
    score: result.score,
    summary: result.summary,
    pros: result.pros,
    cons: result.cons,
    modelId,
    scoredAt: scoredAt.toISOString(),
  };
}
