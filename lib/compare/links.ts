import { formatDocRef, type DocRef } from "@/lib/artifacts/tabs";
import type { ArtifactTab } from "@/lib/artifacts/kinds";
import { KEY_PATTERN } from "@/lib/bridge/wire";
import type { Scoped } from "@/lib/db/scoped";

/** The job page's document view: /jobs/<slug>?tab=<tab>&doc=<ref>. */
export function documentHrefForJob(slug: string, ref: DocRef, tab: ArtifactTab): string {
  return `/jobs/${slug}?tab=${tab}&doc=${formatDocRef(ref)}`;
}

/**
 * Until Milestone 24 there is no company page, so a company document opens
 * through the company's newest job, the same way the Companies list links its
 * research. Milestone 24 changes this one function to return
 * `/companies/<id>?doc=<key>`. A company with no job falls back to the list.
 */
export async function documentHrefForCompany(s: Scoped, companyId: string, key: string): Promise<string> {
  const jobs = (await s.opportunity.listAll()).filter((o) => o.companyId === companyId);
  const newest = jobs[jobs.length - 1];
  if (!newest) return "/companies";
  return documentHrefForJob(newest.slug, { scope: "company", key }, "research");
}

/**
 * The same link worked out from a compare URL alone, for the 404 page, which
 * receives no props. A job-scope document may sit on any tab, so the Documents
 * tab is a guess; the document list there still shows the job's documents.
 */
export function backHrefFromCompareUrl(pathname: string, search: URLSearchParams): string | null {
  const job = /^\/jobs\/([^/]+)\/compare\/?$/.exec(pathname);
  const company = /^\/companies\/([^/]+)\/compare\/?$/.exec(pathname);
  const raw = search.get("doc");
  if (job) {
    const slug = job[1];
    const m = raw ? /^(job|company):(.+)$/.exec(raw) : null;
    if (!m || !KEY_PATTERN.test(m[2])) return `/jobs/${slug}`;
    const scope = m[1] === "job" ? "opportunity" : "company";
    return documentHrefForJob(slug, { scope, key: m[2] }, scope === "company" ? "research" : "documents");
  }
  if (company) {
    const id = company[1];
    return raw && KEY_PATTERN.test(raw) ? `/companies/${id}?doc=${raw}` : `/companies/${id}`;
  }
  return null;
}
