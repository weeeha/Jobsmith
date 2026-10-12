import { z } from "zod";
import { scoreFit, type FitResult } from "@/lib/ai/score-fit";
import type { AddJobDeps } from "@/lib/intake/deps";
import { addJobFormSchema } from "@/lib/intake/form";
import { resolvePosting } from "@/lib/intake/resolve";
import type { NeedsTextReason } from "@/lib/intake/values";
import type { ProfileView } from "@/lib/profile/store";
import { hardFilters, type HardFilterResult } from "./hard-filters";
import { logFit } from "./log";
import { fitReadiness } from "./readiness";

export type TestPostingResult = {
  roleTitle: string | null;
  companyName: string | null;
  hardFilters: HardFilterResult;
  fit: FitResult | null;
  note: "ai_off" | "no_resume" | "failed" | null;
};

export type TestPostingOutcome =
  | { kind: "result"; result: TestPostingResult }
  | { kind: "needs_text"; reason: NeedsTextReason };

// The same two fields and messages as the Add job dialog, plus the rule that
// one of them has to be filled in.
export const testPostingFormSchema = z
  .object({
    sourceUrl: addJobFormSchema.shape.sourceUrl,
    postingText: addJobFormSchema.shape.postingText,
  })
  .refine((value) => Boolean(value.sourceUrl) || Boolean(value.postingText?.trim()), {
    message: "Paste a link or the posting text.",
    path: ["postingText"],
  });

/**
 * Reads a posting the way Add job does, then checks it against the saved
 * hard filters and scores it against the saved resume and preferences. It
 * touches no table: nothing is saved, so the box can be used on any posting
 * at any time. The caller loads the profile.
 */
export async function testPosting(
  input: { url?: string; text?: string },
  context: { userId: string; profile: ProfileView },
  deps: AddJobDeps,
): Promise<TestPostingOutcome> {
  const startedAt = deps.now().getTime();
  const resolved = await resolvePosting({ url: input.url, text: input.text, userId: context.userId }, deps);
  if (resolved.kind === "needs_text") return { kind: "needs_text", reason: resolved.reason };

  const { fields, bodyMd } = resolved.posting;
  const { profile } = context;
  const base = {
    roleTitle: fields.roleTitle,
    companyName: fields.companyName,
    hardFilters: hardFilters(fields, profile.preferences),
  };
  const elapsed = () => deps.now().getTime() - startedAt;
  const unscored = { opportunityId: null, outcome: "test", modelId: null, ms: 0, inputTokens: null, outputTokens: null } as const;

  const readiness = fitReadiness({ aiOn: deps.ai !== null, postingMd: bodyMd, resumeMd: profile.resumeMd });
  if (readiness !== "ready" || profile.resumeMd === null) {
    logFit({ ...unscored, reason: readiness, ms: elapsed() });
    // A blank posting cannot happen after a successful read; if it ever did,
    // "failed" is the honest word.
    const note = readiness === "ai_off" ? "ai_off" : readiness === "no_resume" ? "no_resume" : "failed";
    return { kind: "result", result: { ...base, fit: null, note } };
  }

  const outcome = await scoreFit(
    deps.ai,
    {
      posting: {
        roleTitle: fields.roleTitle ?? "Untitled posting",
        companyName: fields.companyName ?? "Unknown company",
        location: fields.location,
        workMode: fields.workMode,
        compMin: fields.compMin,
        compMax: fields.compMax,
        compCurrency: fields.compCurrency,
        bodyMd,
      },
      headline: profile.headline,
      resumeMd: profile.resumeMd,
      preferences: profile.preferences,
    },
    { userId: context.userId },
  );

  logFit({
    ...unscored,
    reason: outcome.status === "scored" ? null : outcome.error,
    modelId: outcome.modelId,
    ms: elapsed(),
    inputTokens: outcome.usage?.inputTokens ?? null,
    outputTokens: outcome.usage?.outputTokens ?? null,
  });

  if (outcome.status === "scored" && outcome.fit !== null) {
    return { kind: "result", result: { ...base, fit: outcome.fit, note: null } };
  }
  return { kind: "result", result: { ...base, fit: null, note: "failed" } };
}
