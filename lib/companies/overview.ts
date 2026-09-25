import { docsForTab } from "@/lib/artifacts/tabs";
import type { ArtifactMeta, OpportunitySummary } from "@/lib/db/scoped";

export type CompanyOverviewJob = {
  slug: string;
  roleTitle: string;
  /** The current stage label for an active job, or the word "Closed" for a closed one. */
  stageLabel: string;
};

export type CompanyOverviewDoc = {
  key: string;
  title: string;
  /** The job this document's link points at - see buildCompanyOverviews below. */
  jobSlug: string;
};

export type CompanyOverview = {
  id: string;
  name: string;
  jobs: CompanyOverviewJob[];
  research: CompanyOverviewDoc[];
};

/**
 * Builds the Companies page's per-company view models from three already
 * fetched slices: every company, every one of the signed-in user's
 * opportunities (any status), and, for each company, its latest company-wide
 * shared documents (only ever research, fit briefs or people notes -
 * lib/artifacts/upsert.ts is the only place a company-scoped artifact is
 * created, and it rejects any other kind onto the opportunity instead).
 *
 * Pure and synchronous on purpose: the page's loader does the actual
 * database reads and hands their results in here, which is what makes this
 * function trivial to unit test without a database.
 */
export function buildCompanyOverviews(
  companies: { id: string; name: string }[],
  opportunities: OpportunitySummary[],
  companyDocuments: Map<string, ArtifactMeta[]>,
): CompanyOverview[] {
  const jobsByCompany = new Map<string, OpportunitySummary[]>();
  for (const opp of opportunities) {
    const existing = jobsByCompany.get(opp.companyId);
    if (existing) {
      existing.push(opp);
    } else {
      jobsByCompany.set(opp.companyId, [opp]);
    }
  }

  return [...companies]
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "accent" }))
    .map((company) => {
      const companyJobs = jobsByCompany.get(company.id) ?? [];
      const active = companyJobs.filter((job) => job.status === "active");
      const closed = companyJobs.filter((job) => job.status === "closed");

      const jobs: CompanyOverviewJob[] = [...active, ...closed].map((job) => ({
        slug: job.slug,
        roleTitle: job.roleTitle,
        stageLabel: job.status === "closed" ? "Closed" : job.stage.label,
      }));

      // A company-scoped artifact is only ever created by pushing against
      // one of the company's own opportunities, so a company with any
      // shared research always has at least one job to link it from.
      // Preferring an active job over a closed one keeps the link pointing
      // somewhere still being worked; once every job is closed, any of them
      // can carry it.
      const linkJob = active[0] ?? closed[0] ?? null;
      const research: CompanyOverviewDoc[] = linkJob
        ? docsForTab(companyDocuments.get(company.id) ?? [], "research").map((doc) => ({
            key: doc.key,
            title: doc.title,
            jobSlug: linkJob.slug,
          }))
        : [];

      return { id: company.id, name: company.name, jobs, research };
    });
}
