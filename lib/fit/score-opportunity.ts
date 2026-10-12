import { scoreFit } from "@/lib/ai/score-fit";
import type { Scoped } from "@/lib/db/scoped";
import { messageFor } from "@/lib/pipeline/messages";
import { loadProfile } from "@/lib/profile/store";
import { fail, ok, type Result } from "@/lib/result";
import type { FitDeps } from "./deps";
import { logFit, logFitError } from "./log";
import { fitReadiness, type FitReadiness } from "./readiness";
import { toStoredFit } from "./stored";

export type FitRun = { status: "done" | "failed" | "none"; score: number | null };

/**
 * Marks a job `pending` when it can be scored and says whether it can. Runs
 * inside the request, so the page the user lands on already shows "scoring".
 * A job that cannot be scored is left exactly as it is.
 */
export async function queueFitScoring(
  s: Scoped,
  opportunityId: string,
  deps: FitDeps,
): Promise<FitReadiness | "not_found"> {
  const opportunity = await s.opportunity.getById(opportunityId);
  if (!opportunity) return "not_found";
  const profile = await loadProfile(s);
  const readiness = fitReadiness({ aiOn: deps.ai !== null, postingMd: opportunity.postingMd, resumeMd: profile.resumeMd });
  if (readiness === "ready") await s.opportunity.update(opportunityId, { fitStatus: "pending" });
  return readiness;
}

/**
 * Scores one job and writes the result. A failed or not-ready run changes
 * only `fit_status`: the previous score and fit document stay, so a failed
 * retry never wipes a good score.
 */
export async function scoreOpportunity(
  s: Scoped,
  opportunityId: string,
  deps: FitDeps,
): Promise<Result<FitRun, "not_found">> {
  const startedAt = deps.now().getTime();
  const elapsed = () => deps.now().getTime() - startedAt;

  const opportunity = await s.opportunity.getById(opportunityId);
  if (!opportunity) return fail("not_found", messageFor("not_found"));
  const company = await s.company.getById(opportunity.companyId);
  const profile = await loadProfile(s);

  const readiness = fitReadiness({ aiOn: deps.ai !== null, postingMd: opportunity.postingMd, resumeMd: profile.resumeMd });
  if (readiness !== "ready" || opportunity.postingMd === null || profile.resumeMd === null) {
    await s.opportunity.update(opportunityId, { fitStatus: "none" });
    logFit({ opportunityId, outcome: "none", reason: readiness, modelId: null, ms: elapsed(), inputTokens: null, outputTokens: null });
    return ok({ status: "none", score: null });
  }

  const outcome = await scoreFit(
    deps.ai,
    {
      posting: {
        roleTitle: opportunity.roleTitle,
        companyName: company?.name ?? "Unknown company",
        location: opportunity.location,
        workMode: opportunity.workMode,
        compMin: opportunity.compMin,
        compMax: opportunity.compMax,
        compCurrency: opportunity.compCurrency,
        bodyMd: opportunity.postingMd,
      },
      headline: profile.headline,
      resumeMd: profile.resumeMd,
      preferences: profile.preferences,
    },
    { userId: s.userId },
  );

  const tokens = { inputTokens: outcome.usage?.inputTokens ?? null, outputTokens: outcome.usage?.outputTokens ?? null };

  if (outcome.status === "scored" && outcome.fit !== null) {
    const modelId = outcome.modelId ?? "unknown";
    await s.opportunity.update(opportunityId, {
      fitStatus: "done",
      fitScore: outcome.fit.score,
      fit: toStoredFit(outcome.fit, modelId, deps.now()),
    });
    logFit({ opportunityId, outcome: "done", reason: null, modelId, ms: elapsed(), ...tokens });
    return ok({ status: "done", score: outcome.fit.score });
  }

  await s.opportunity.update(opportunityId, { fitStatus: "failed" });
  logFit({ opportunityId, outcome: "failed", reason: outcome.error, modelId: outcome.modelId, ms: elapsed(), ...tokens });
  return ok({ status: "failed", score: null });
}

/**
 * The only thing ever handed to `after()`, and what the retry button awaits.
 * It never throws and never leaves a job `pending`: Next prints a failed
 * `after()` callback's whole error object, and a database error carries the
 * SQL text and its parameters, which here include the resume-based summary.
 * The error is logged by name only and the status is moved to `failed`.
 * Returns null when the job does not exist.
 */
export async function scoreSafely(s: Scoped, opportunityId: string, deps: FitDeps): Promise<FitRun | null> {
  try {
    const result = await scoreOpportunity(s, opportunityId, deps);
    return result.ok ? result.data : null;
  } catch (error) {
    logFitError(error);
    try {
      await s.opportunity.update(opportunityId, { fitStatus: "failed" });
    } catch (secondError) {
      logFitError(secondError);
    }
    return { status: "failed", score: null };
  }
}
