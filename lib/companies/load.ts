import type { ArtifactMeta, Scoped } from "@/lib/db/scoped";
import { buildCompanyOverviews, type CompanyOverview } from "./overview";

/**
 * The Companies page's loader: reads every company, every opportunity (any
 * status) and each company's latest shared documents through the scoped
 * helpers, then hands them to buildCompanyOverviews to shape into the
 * page's view model. Kept separate from that pure function so the grouping
 * logic itself needs no database to test.
 */
export async function loadCompanyOverviews(s: Scoped): Promise<CompanyOverview[]> {
  const companies = await s.company.list();
  const opportunities = await s.opportunity.listSummaries("all");

  const companyDocuments = new Map<string, ArtifactMeta[]>(
    await Promise.all(
      companies.map(async (company) => [company.id, await s.artifact.listLatestForCompany(company.id)] as const),
    ),
  );

  return buildCompanyOverviews(companies, opportunities, companyDocuments);
}
