import type { AtsVendor } from "@/lib/intake/values";
import type { WorkMode } from "@/lib/pipeline/values";

export type AtsRef = { kind: AtsVendor; org: string; jobId: string; region: "us" | "eu" };
export type AtsPosting = {
  companyName: string;
  companyFromSlug: boolean;
  roleTitle: string;
  location: string | null;
  workMode: WorkMode | null;
  bodyMd: string;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DIGITS = /^\d{1,20}$/;
const SLUG = /^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/;

export function matchAtsUrl(raw: string): AtsRef | null {
  if (!URL.canParse(raw)) return null;
  const url = new URL(raw);
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  const host = url.hostname.toLowerCase();
  // Pasted links can carry a stray % that breaks decoding; treat that as no match.
  let parts: string[];
  try {
    parts = url.pathname.split("/").filter(Boolean).map((p) => decodeURIComponent(p));
  } catch {
    return null;
  }

  const gh = /^(?:job-boards|boards)(\.eu)?\.greenhouse\.io$/.exec(host);
  if (gh) {
    // /{board}/jobs/{id}
    if (parts.length >= 3 && parts[1] === "jobs" && SLUG.test(parts[0]!) && DIGITS.test(parts[2]!)) {
      return { kind: "greenhouse", org: parts[0]!, jobId: parts[2]!, region: gh[1] ? "eu" : "us" };
    }
    // /embed/job_app?for={board}&token={id}
    const board = url.searchParams.get("for");
    const token = url.searchParams.get("token");
    if (parts[0] === "embed" && board && token && SLUG.test(board) && DIGITS.test(token)) {
      return { kind: "greenhouse", org: board, jobId: token, region: gh[1] ? "eu" : "us" };
    }
    return null;
  }
  const lever = /^jobs(\.eu)?\.lever\.co$/.exec(host);
  if (lever) {
    if (parts.length >= 2 && SLUG.test(parts[0]!) && UUID.test(parts[1]!)) {
      return { kind: "lever", org: parts[0]!, jobId: parts[1]!.toLowerCase(), region: lever[1] ? "eu" : "us" };
    }
    return null;
  }
  if (host === "jobs.ashbyhq.com") {
    if (parts.length >= 2 && parts[0]!.length > 0 && parts[0]!.length <= 100 && UUID.test(parts[1]!)) {
      return { kind: "ashby", org: parts[0]!, jobId: parts[1]!.toLowerCase(), region: "us" };
    }
    return null;
  }
  return null;
}

export function atsApiRequest(ref: AtsRef): { url: string; method: "GET" | "POST"; body?: string } {
  switch (ref.kind) {
    case "greenhouse":
      return {
        url: `https://boards-api${ref.region === "eu" ? ".eu" : ""}.greenhouse.io/v1/boards/${encodeURIComponent(ref.org)}/jobs/${ref.jobId}`,
        method: "GET",
      };
    case "lever":
      return {
        url: `https://api${ref.region === "eu" ? ".eu" : ""}.lever.co/v0/postings/${encodeURIComponent(ref.org)}/${ref.jobId}?mode=json`,
        method: "GET",
      };
    case "ashby":
      return {
        url: "https://jobs.ashbyhq.com/api/non-user-graphql?op=ApiJobPosting",
        method: "POST",
        body: JSON.stringify({
          operationName: "ApiJobPosting",
          variables: { organizationHostedJobsPageName: ref.org, jobPostingId: ref.jobId },
          query:
            "query ApiJobPosting($organizationHostedJobsPageName: String!, $jobPostingId: String!) { jobPosting(organizationHostedJobsPageName: $organizationHostedJobsPageName, jobPostingId: $jobPostingId) { id title descriptionHtml locationName employmentType compensationTierSummary publishedDate applicationDeadline jobPostingUrl organization { name } } }",
        }),
      };
  }
}

export function titleFromSlug(slug: string): string {
  return slug
    .split(/[-_.\s]+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

export function workModeFromText(text: string | null | undefined): WorkMode | null {
  if (!text) return null;
  const t = text.toLowerCase();
  if (/\bhybrid\b/.test(t)) return "hybrid";
  if (/\bremote\b/.test(t)) return "remote";
  if (/\b(on-?site|in office|in-office)\b/.test(t)) return "onsite";
  return null;
}
