import { describe, expect, it } from "vitest";
import { buildCompanyOverviews } from "@/lib/companies/overview";
import type { ArtifactMeta, OpportunitySummary } from "@/lib/db/scoped";

function company(id: string, name: string): { id: string; name: string } {
  return { id, name };
}

function opportunity(partial: Partial<OpportunitySummary> & { slug: string; companyId: string }): OpportunitySummary {
  return {
    roleTitle: "Role",
    companyName: "Company",
    status: "active",
    stage: { kind: "saved", label: "Saved" },
    ...partial,
  } as OpportunitySummary;
}

function doc(partial: Partial<ArtifactMeta> & { key: string }): ArtifactMeta {
  return {
    id: partial.key,
    title: partial.key,
    kind: "research",
    stageId: null,
    companyId: "1",
    opportunityId: null,
    version: 1,
    contentHash: "h",
    sourceHash: "h",
    origin: "pushed",
    editedAt: null,
    sentAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...partial,
  } as ArtifactMeta;
}

describe("buildCompanyOverviews", () => {
  it("sorts companies A to Z, case-insensitively", () => {
    const companies = [company("3", "zeta Robotics"), company("1", "Acme Inc"), company("2", "banana Labs")];
    const result = buildCompanyOverviews(companies, [], new Map());
    expect(result.map((c) => c.name)).toEqual(["Acme Inc", "banana Labs", "zeta Robotics"]);
  });

  it("lists active jobs before closed, each group in the order the data gives", () => {
    const companies = [company("1", "Acme")];
    const opportunities = [
      opportunity({ slug: "closed-a", companyId: "1", status: "closed", roleTitle: "Closed A" }),
      opportunity({ slug: "active-b", companyId: "1", status: "active", roleTitle: "Active B" }),
      opportunity({ slug: "closed-c", companyId: "1", status: "closed", roleTitle: "Closed C" }),
      opportunity({ slug: "active-d", companyId: "1", status: "active", roleTitle: "Active D" }),
    ];
    const result = buildCompanyOverviews(companies, opportunities, new Map());
    expect(result[0].jobs.map((j) => j.slug)).toEqual(["active-b", "active-d", "closed-a", "closed-c"]);
  });

  it("shows the current stage label for an active job and the word Closed for a closed one", () => {
    const companies = [company("1", "Acme")];
    const opportunities = [
      opportunity({
        slug: "active",
        companyId: "1",
        status: "active",
        stage: { kind: "recruiter_screen", label: "Recruiter screen" },
      }),
      opportunity({
        slug: "closed",
        companyId: "1",
        status: "closed",
        stage: { kind: "panel_final", label: "Panel" },
      }),
    ];
    const result = buildCompanyOverviews(companies, opportunities, new Map());
    expect(result[0].jobs.find((j) => j.slug === "active")?.stageLabel).toBe("Recruiter screen");
    expect(result[0].jobs.find((j) => j.slug === "closed")?.stageLabel).toBe("Closed");
  });

  it("lists no jobs for a company nobody applied to", () => {
    const companies = [company("1", "Acme")];
    const result = buildCompanyOverviews(companies, [], new Map());
    expect(result[0].jobs).toEqual([]);
  });

  it("links shared research to an active job when there is one", () => {
    const companies = [company("1", "Acme")];
    const opportunities = [
      opportunity({ slug: "closed", companyId: "1", status: "closed" }),
      opportunity({ slug: "active", companyId: "1", status: "active" }),
    ];
    const companyDocuments = new Map([["1", [doc({ key: "recon", title: "Recon" })]]]);
    const result = buildCompanyOverviews(companies, opportunities, companyDocuments);
    expect(result[0].research).toEqual([{ key: "recon", title: "Recon", jobSlug: "active" }]);
  });

  it("falls back to any job when none is active", () => {
    const companies = [company("1", "Acme")];
    const opportunities = [opportunity({ slug: "closed-only", companyId: "1", status: "closed" })];
    const companyDocuments = new Map([["1", [doc({ key: "recon", title: "Recon" })]]]);
    const result = buildCompanyOverviews(companies, opportunities, companyDocuments);
    expect(result[0].research).toEqual([{ key: "recon", title: "Recon", jobSlug: "closed-only" }]);
  });

  it("has no Shared research section when the company has no company-wide documents", () => {
    const companies = [company("1", "Acme")];
    const opportunities = [opportunity({ slug: "active", companyId: "1", status: "active" })];
    const result = buildCompanyOverviews(companies, opportunities, new Map());
    expect(result[0].research).toEqual([]);
  });
});
