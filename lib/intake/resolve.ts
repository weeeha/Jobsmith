import { matchAtsUrl } from "./ats/match";
import { fetchAtsPosting } from "./ats";
import { readablePage } from "./readable";
import {
  isLoginWalled,
  needsReviewFor,
  MIN_POSTING_TEXT,
  type Extraction,
  type PostingFields,
  type Via,
  type AtsVendor,
  type NeedsTextReason,
} from "./values";
import type { GuardedFetch, FetchFailure } from "./fetch-guard";
import { extractPosting } from "@/lib/ai/extract-posting";
import type { AiDriver } from "@/lib/ai/driver";

export type ResolvedPosting = {
  source: "url" | "text";
  via: Via;
  sourceUrl: string | null;
  bodyMd: string;
  fields: PostingFields;
  extraction: Extraction;
  needsReview: boolean;
  ats: { kind: AtsVendor; org: string } | null;
};

export type ResolveOutcome =
  | { kind: "resolved"; posting: ResolvedPosting; fetchFailure: FetchFailure | null }
  | { kind: "needs_text"; reason: NeedsTextReason; fetchFailure: FetchFailure | null };

export type ResolveDeps = { fetch: GuardedFetch; ai: AiDriver | null; signal?: AbortSignal };

export function needsTextReasonFor(failure: FetchFailure | "unreadable"): NeedsTextReason {
  switch (failure) {
    case "invalid_url":
    case "blocked_scheme":
    case "blocked_port":
    case "blocked_address":
      return "blocked";
    case "timeout":
      return "timeout";
    case "too_large":
      return "too_large";
    case "not_found":
      return "not_found";
    case "unsupported_type":
    case "unreadable":
      return "unreadable";
    default:
      return "fetch_failed";
  }
}

async function resolveFromText(
  text: string,
  url: string | null,
  userId: string,
  deps: ResolveDeps,
  fetchFailure: FetchFailure | null,
): Promise<ResolveOutcome> {
  const outcome = await extractPosting(deps.ai, text, "plain", { userId });
  const extraction: Extraction = outcome.status === "extracted" ? "ai" : outcome.status;
  const posting: ResolvedPosting = {
    source: "text",
    via: "text",
    sourceUrl: url,
    bodyMd: outcome.bodyMd,
    fields: outcome.fields,
    extraction,
    needsReview: needsReviewFor(extraction),
    ats: null,
  };
  return { kind: "resolved", posting, fetchFailure };
}

export async function resolvePosting(
  input: { url?: string; text?: string; userId: string },
  deps: ResolveDeps,
): Promise<ResolveOutcome> {
  const { url, text, userId } = input;

  if (url) {
    const ref = matchAtsUrl(url);
    if (ref) {
      const atsResult = await fetchAtsPosting(ref, deps.fetch, deps.signal);
      if (atsResult.ok) {
        const p = atsResult.data;
        const posting: ResolvedPosting = {
          source: "url",
          via: ref.kind,
          sourceUrl: url,
          bodyMd: p.bodyMd,
          fields: {
            companyName: p.companyName,
            roleTitle: p.roleTitle,
            location: p.location,
            workMode: p.workMode,
            compMin: null,
            compMax: null,
            compCurrency: null,
          },
          extraction: "ats",
          needsReview: false,
          ats: { kind: ref.kind, org: ref.org },
        };
        return { kind: "resolved", posting, fetchFailure: null };
      }
      // The known trap: "unreadable" is not a FetchFailure (it means the
      // vendor's JSON was unparseable or its shape had no title - no
      // network failure happened), so it never appears in fetchFailure.
      const code = atsResult.code;
      const reason = needsTextReasonFor(code);
      const fetchFailure = code === "unreadable" ? null : code;
      if (text) {
        return resolveFromText(text, url, userId, deps, fetchFailure);
      }
      return { kind: "needs_text", reason, fetchFailure };
    }
  }

  if (text) {
    return resolveFromText(text, url ?? null, userId, deps, null);
  }

  // A non-ATS link, alone (an ATS link with no text already returned above;
  // text alone already returned above; url is therefore defined here).
  const parsed = new URL(url!);
  if (isLoginWalled(parsed)) {
    return { kind: "needs_text", reason: "login_required", fetchFailure: null };
  }
  const pageResult = await deps.fetch(url!, { accept: "html", signal: deps.signal });
  if (!pageResult.ok) {
    return { kind: "needs_text", reason: needsTextReasonFor(pageResult.code), fetchFailure: pageResult.code };
  }
  const page = readablePage(pageResult.data.body);
  const jsonLdHasCompanyAndRole = Boolean(page.jsonLd?.companyName && page.jsonLd?.roleTitle);
  if (jsonLdHasCompanyAndRole && page.textLength >= MIN_POSTING_TEXT) {
    const posting: ResolvedPosting = {
      source: "url",
      via: "page",
      sourceUrl: url!,
      bodyMd: page.bodyMd,
      fields: {
        companyName: page.jsonLd!.companyName,
        roleTitle: page.jsonLd!.roleTitle,
        location: page.jsonLd!.location,
        workMode: page.jsonLd!.workMode,
        compMin: null,
        compMax: null,
        compCurrency: null,
      },
      extraction: "json_ld",
      needsReview: false,
      ats: null,
    };
    return { kind: "resolved", posting, fetchFailure: null };
  }
  if (page.textLength < MIN_POSTING_TEXT) {
    return { kind: "needs_text", reason: "too_short", fetchFailure: null };
  }

  const outcome = await extractPosting(deps.ai, page.bodyMd, "markdown", { userId });
  const fields: PostingFields = {
    companyName: page.jsonLd?.companyName ?? outcome.fields.companyName,
    roleTitle: page.jsonLd?.roleTitle ?? outcome.fields.roleTitle,
    location: page.jsonLd?.location ?? outcome.fields.location,
    workMode: page.jsonLd?.workMode ?? outcome.fields.workMode,
    compMin: outcome.fields.compMin,
    compMax: outcome.fields.compMax,
    compCurrency: outcome.fields.compCurrency,
  };
  const extraction: Extraction =
    outcome.status === "extracted" || (outcome.status === "ai_incomplete" && Boolean(fields.companyName) && Boolean(fields.roleTitle))
      ? "ai"
      : outcome.status;
  const posting: ResolvedPosting = {
    source: "url",
    via: "page",
    sourceUrl: url!,
    bodyMd: outcome.bodyMd,
    fields,
    extraction,
    needsReview: needsReviewFor(extraction),
    ats: null,
  };
  return { kind: "resolved", posting, fetchFailure: null };
}
