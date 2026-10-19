import { z } from "zod";
import { scoreFit } from "@/lib/ai/score-fit";
import type { AddJobDeps } from "@/lib/intake/deps";
import { addJobFormSchema } from "@/lib/intake/form";
import { resolvePosting } from "@/lib/intake/resolve";
import type { NeedsTextReason } from "@/lib/intake/values";
import { fitBand, type FitBand } from "./bands";
import { hardFilters, type HardFilterResult } from "./hard-filters";
import { logFit } from "./log";
import type { FitProfile } from "./profile";
import { fitReadiness } from "./readiness";
import { toStoredFit, type StoredFit } from "./stored";

export type TestPostingResult = {
  roleTitle: string | null;
  companyName: string | null;
  hardFilters: HardFilterResult;
  fit: StoredFit | null;
  /** The score's band against the saved threshold, when there is a score. */
  band: FitBand | null;
  /** Why there is no fit, when there is none. */
  note: "ai_off" | "no_resume" | "failed" | null;
};

export type TestPostingState =
  | { ok: true; result: TestPostingResult }
  | { ok: false; code: "invalid" | "needs_text" | "server_error"; message: string; fieldErrors?: Record<string, string> }
  | undefined;

export type TestPostingOutcome =
  | { kind: "result"; result: TestPostingResult }
  | { kind: "needs_text"; reason: NeedsTextReason };

// The link field takes Add job's rules and messages. The text field only
// shows up after a link could not be read, as in the Add job dialog.
export const testPostingFormSchema = z.object({
  sourceUrl: z
    .string({ error: "Paste a link to a posting." })
    .trim()
    .min(1, "Paste a link to a posting.")
    .pipe(addJobFormSchema.shape.sourceUrl.unwrap()),
  postingText: addJobFormSchema.shape.postingText,
});

/**
 * Reads a posting the way Add job does, then checks it against the saved
 * hard filters and scores it against the saved resume and preferences. It
 * touches no table: nothing is saved, so the box can be used on any posting
 * at any time. The caller loads the profile.
 */
export async function testPosting(
  input: { url: string; text?: string },
  context: { userId: string; profile: FitProfile },
  deps: AddJobDeps,
): Promise<TestPostingOutcome> {
  const startedAt = deps.now().getTime();
  const elapsed = () => deps.now().getTime() - startedAt;
  const resolved = await resolvePosting({ url: input.url, text: input.text, userId: context.userId }, deps);
  if (resolved.kind === "needs_text") return { kind: "needs_text", reason: resolved.reason };

  const { fields, bodyMd } = resolved.posting;
  const { profile } = context;
  const base = { roleTitle: fields.roleTitle, companyName: fields.companyName, hardFilters: hardFilters(fields, profile.preferences) };
  const line = { opportunityId: null, outcome: "test", inputTokens: null, outputTokens: null } as const;

  const readiness = fitReadiness({ aiOn: deps.ai !== null, postingMd: bodyMd, resumeMd: profile.resumeMd });
  if (readiness !== "ready" || profile.resumeMd === null) {
    logFit({ ...line, reason: readiness, modelId: null, ms: elapsed() });
    // A blank posting cannot happen after a successful read; if it ever did,
    // "failed" is the honest word.
    const note = readiness === "ai_off" ? "ai_off" : readiness === "no_resume" ? "no_resume" : "failed";
    return { kind: "result", result: { ...base, fit: null, band: null, note } };
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
    ...line,
    reason: outcome.status === "scored" ? null : outcome.error,
    modelId: outcome.modelId,
    ms: elapsed(),
    inputTokens: outcome.usage?.inputTokens ?? null,
    outputTokens: outcome.usage?.outputTokens ?? null,
  });

  if (outcome.status === "scored" && outcome.fit !== null) {
    const fit = toStoredFit(outcome.fit, outcome.modelId ?? "unknown", deps.now());
    const band = fitBand(fit.score, profile.preferences.scoreThreshold);
    return { kind: "result", result: { ...base, fit, band, note: null } };
  }
  return { kind: "result", result: { ...base, fit: null, band: null, note: "failed" } };
}
