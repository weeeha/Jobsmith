import type { WorkMode } from "@/lib/pipeline/values";

export const MIN_POSTING_TEXT = 600;
export const MAX_POSTING_CHARS = 100_000;
export const MAX_ARTICLE_HTML = 300_000;
export const MAX_LINK_CHARS = 2_048;

export const NEEDS_TEXT_REASONS = [
  "login_required",
  "blocked",
  "timeout",
  "too_large",
  "not_found",
  "too_short",
  "unreadable",
  "fetch_failed",
] as const;
export type NeedsTextReason = (typeof NEEDS_TEXT_REASONS)[number];

export const EXTRACTIONS = ["ats", "json_ld", "ai", "ai_off", "ai_failed", "ai_incomplete"] as const;
export type Extraction = (typeof EXTRACTIONS)[number];

export const VIAS = ["greenhouse", "ashby", "lever", "page", "text"] as const;
export type Via = (typeof VIAS)[number];

export type AtsVendor = "greenhouse" | "ashby" | "lever";

export type PostingFields = {
  companyName: string | null;
  roleTitle: string | null;
  location: string | null;
  workMode: WorkMode | null;
  compMin: number | null;
  compMax: number | null;
  compCurrency: string | null;
};

export const EMPTY_FIELDS: PostingFields = {
  companyName: null,
  roleTitle: null,
  location: null,
  workMode: null,
  compMin: null,
  compMax: null,
  compCurrency: null,
};

export const LOGIN_WALLED_HOSTS = ["linkedin.com"] as const;

export function isLoginWalled(url: URL): boolean {
  const host = url.hostname.toLowerCase();
  return LOGIN_WALLED_HOSTS.some((entry) => host === entry || host.endsWith(`.${entry}`));
}

export function needsReviewFor(extraction: Extraction): boolean {
  return extraction === "ai_off" || extraction === "ai_failed" || extraction === "ai_incomplete";
}
