import type { Scoped } from "@/lib/db/scoped";
import { createOpportunity } from "@/lib/pipeline/create";
import { findActiveDuplicate } from "@/lib/pipeline/duplicates";
import { EMPTY_FIELDS, type PostingFields, type NeedsTextReason } from "./values";
import { resolvePosting, type ResolvedPosting } from "./resolve";
import { decodeDraft, type AddJobForm } from "./form";
import type { AddJobDeps } from "./deps";
import { logIntake } from "./log";
import type { AddedJob } from "./state";
import type { FetchFailure } from "./fetch-guard";

export type AddJobResult =
  | { kind: "added"; id: string; slug: string; roleTitle: string; companyName: string; note: AddedJob["note"] }
  | { kind: "invalid"; fieldErrors: Record<string, string>; message?: string }
  | { kind: "needs_text"; reason: NeedsTextReason }
  | { kind: "needs_details"; reason: "ai_off" | "ai_failed"; missing: ("companyName" | "roleTitle")[]; draft: ResolvedPosting }
  | { kind: "duplicate"; existingSlug: string | null; draft: ResolvedPosting | null };

// Typed values win; resolved values fill blanks, field by field. Pay is
// one unit - the moment either Pay from or Pay to was typed, the typed pair
// (and typed currency) is used as a whole, never mixed with the resolved
// pair's other half.
export function mergeFields(typed: Partial<PostingFields>, resolved: PostingFields): PostingFields {
  const payTyped = typed.compMin !== undefined || typed.compMax !== undefined;
  return {
    companyName: typed.companyName ?? resolved.companyName,
    roleTitle: typed.roleTitle ?? resolved.roleTitle,
    location: typed.location ?? resolved.location,
    workMode: typed.workMode ?? resolved.workMode,
    compMin: payTyped ? (typed.compMin ?? null) : resolved.compMin,
    compMax: payTyped ? (typed.compMax ?? null) : resolved.compMax,
    compCurrency: payTyped ? (typed.compCurrency ?? null) : resolved.compCurrency,
  };
}

function hostOf(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    return new URL(url).hostname;
  } catch {
    return null;
  }
}

export async function addJob(s: Scoped, userId: string, form: AddJobForm, deps: AddJobDeps): Promise<AddJobResult> {
  const startedAt = Date.now();
  const typed: Partial<PostingFields> = {
    companyName: form.companyName,
    roleTitle: form.roleTitle,
    location: form.location,
    workMode: form.workMode,
    compMin: form.compMin,
    compMax: form.compMax,
    compCurrency: form.compCurrency,
  };

  const record = (
    outcome: "added" | "invalid" | "needs_text" | "needs_details" | "duplicate",
    resolved: ResolvedPosting | null,
    fetchFailure: FetchFailure | null,
    linkOnly: boolean,
  ) => {
    const hadSource = Boolean(form.sourceUrl || form.postingText);
    logIntake({
      requestId: deps.requestId,
      outcome,
      via: resolved?.via ?? (linkOnly || !hadSource ? "manual" : null),
      extraction: resolved?.extraction ?? null,
      fetchFailure,
      host: hostOf(resolved?.sourceUrl ?? form.sourceUrl),
      ms: Date.now() - startedAt,
    });
  };

  // A valid draft short-circuits resolution entirely: this is what
  // keeps a second submit of the same form from re-fetching a link or
  // re-calling the model.
  let resolved: ResolvedPosting | null = decodeDraft(form.draft);
  let fetchFailure: FetchFailure | null = null;
  let linkOnly = false;

  if (!resolved && (form.sourceUrl || form.postingText)) {
    const outcome = await resolvePosting({ url: form.sourceUrl, text: form.postingText, userId }, deps);
    if (outcome.kind === "needs_text") {
      fetchFailure = outcome.fetchFailure;
      if (typed.companyName && typed.roleTitle) {
        // A link that cannot be read never blocks the add when the
        // company and role were typed anyway.
        linkOnly = true;
      } else {
        record("needs_text", null, fetchFailure, false);
        return { kind: "needs_text", reason: outcome.reason };
      }
    } else {
      resolved = outcome.posting;
      fetchFailure = outcome.fetchFailure;
    }
  }

  const merged = mergeFields(typed, resolved?.fields ?? EMPTY_FIELDS);

  if (!merged.companyName || !merged.roleTitle) {
    if (!resolved) {
      const fieldErrors: Record<string, string> = {};
      if (!merged.companyName) fieldErrors.companyName = "Enter a company name.";
      if (!merged.roleTitle) fieldErrors.roleTitle = "Enter a role.";
      record("invalid", null, fetchFailure, false);
      return { kind: "invalid", fieldErrors };
    }
    const missing: ("companyName" | "roleTitle")[] = [];
    if (!merged.companyName) missing.push("companyName");
    if (!merged.roleTitle) missing.push("roleTitle");
    record("needs_details", resolved, fetchFailure, false);
    return { kind: "needs_details", reason: resolved.extraction === "ai_off" ? "ai_off" : "ai_failed", missing, draft: resolved };
  }

  if (form.intent !== "add_anyway") {
    const duplicate = await findActiveDuplicate(s, { companyName: merged.companyName, roleTitle: merged.roleTitle, location: merged.location });
    if (duplicate) {
      record("duplicate", resolved, fetchFailure, linkOnly);
      return { kind: "duplicate", existingSlug: duplicate.slug, draft: resolved };
    }
  }

  const created = await createOpportunity(
    s,
    {
      companyName: merged.companyName,
      roleTitle: merged.roleTitle,
      location: merged.location ?? undefined,
      workMode: merged.workMode ?? undefined,
      compMin: merged.compMin ?? undefined,
      compMax: merged.compMax ?? undefined,
      compCurrency: merged.compCurrency ?? undefined,
      compNote: form.compNote,
      myAsk: form.myAsk,
      sourceUrl: resolved?.sourceUrl ?? form.sourceUrl,
      postingText: resolved?.bodyMd || undefined,
      source: resolved?.source ?? "manual",
      needsReview: resolved?.needsReview ?? false,
      ats: resolved?.ats ?? undefined,
    },
    deps.now(),
    { allowDuplicate: true },
  );

  if (!created.ok) {
    // A slug race: addJob's own findActiveDuplicate check above already
    // passed, so createOpportunity's own duplicate rejection here can only
    // mean a concurrent insert landed between the two - there is no
    // existing slug to point at.
    record("duplicate", resolved, fetchFailure, linkOnly);
    return { kind: "duplicate", existingSlug: null, draft: resolved };
  }

  const note: AddedJob["note"] = resolved?.needsReview ? "review" : linkOnly ? "link_only" : "none";
  record("added", resolved, fetchFailure, linkOnly);
  return { kind: "added", id: created.data.id, slug: created.data.slug, roleTitle: merged.roleTitle, companyName: merged.companyName, note };
}
