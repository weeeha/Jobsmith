import { describe, expect, it } from "vitest";
import { makeTestDb, createTestUser } from "../helpers/db";
import { scoped } from "@/lib/db/scoped";
import { createOpportunity } from "@/lib/pipeline/create";
import { upsertArtifacts } from "@/lib/artifacts/upsert";
import { loadCompanyCompare, loadJobCompare } from "@/lib/compare/page-model";
import { documentHrefForCompany } from "@/lib/compare/links";
import { expectOk } from "../helpers/result";

async function setup(email: string) {
  const { db, close } = await makeTestDb();
  const user = await createTestUser(db, email);
  const s = scoped(db, user.id);
  const job = expectOk(await createOpportunity(s, { companyName: "Northwind Labs", roleTitle: "Designer" }));
  const opp = await s.opportunity.getById(job.id);
  const push = async (scope: "opportunity" | "company", key: string, bodyMd: string) =>
    upsertArtifacts(
      s,
      job.id,
      [{ key, kind: scope === "company" ? "research" : "cover_letter", title: "Doc", scope, stage: null, bodyMd }],
      { origin: "pushed" },
    );
  return { db, s, close, push, slug: job.slug, companyId: opp!.companyId };
}

describe("compare page model", () => {
  it("jobs route: another user's slug and an unknown doc are not found; a company ref resolves through the company", async () => {
    const { db, s, close, push, slug, companyId } = await setup("pm1@example.com");
    try {
      await push("opportunity", "cl", "# L\nv1");
      await push("opportunity", "cl", "# L\nv2");
      await push("company", "recon", "# R\nv1");
      await push("company", "recon", "# R\nv2");

      expect((await loadJobCompare(s, slug, { doc: "job:cl" })).status).toBe("ok");
      expect((await loadJobCompare(s, slug, { doc: "job:nope" })).status).toBe("not_found");
      expect((await loadJobCompare(s, slug, {})).status).toBe("not_found");
      expect((await loadJobCompare(s, slug, { doc: "job:cl", a: "1", b: "9" })).status).toBe("not_found");
      const other = await createTestUser(db, "pm1-other@example.com");
      expect((await loadJobCompare(scoped(db, other.id), slug, { doc: "job:cl" })).status).toBe("not_found");

      const company = await loadJobCompare(s, slug, { doc: "company:recon", view: "inline" });
      expect(company.status).toBe("ok");
      if (company.status === "ok") {
        expect(company.companyId).toBe(companyId);
        expect(company.view).toBe("inline");
        expect(company.tab).toBe("research");
      }
      expect(await documentHrefForCompany(s, companyId, "recon")).toBe(`/jobs/${slug}?tab=research&doc=company:recon`);
    } finally {
      await close();
    }
  });

  it("companies route: another user's id is not found; doc is the bare key; no pair rewrites nothing", async () => {
    const { db, s, close, push, companyId } = await setup("pm2@example.com");
    try {
      await push("company", "recon", "# R\nv1");
      await push("company", "recon", "# R\nv2");
      const m = await loadCompanyCompare(s, companyId, { doc: "recon" });
      expect(m.status).toBe("ok");
      if (m.status === "ok") {
        expect(m.doc).toEqual({ scope: "company", key: "recon" });
        expect([m.comparison.a.version, m.comparison.b.version]).toEqual([1, 2]);
      }
      expect((await loadCompanyCompare(s, companyId, { doc: "company:recon" })).status).toBe("not_found");
      expect((await loadCompanyCompare(s, companyId, { doc: "nope" })).status).toBe("not_found");
      expect((await loadCompanyCompare(s, "not-a-uuid", { doc: "recon" })).status).toBe("not_found");
      const other = await createTestUser(db, "pm2-other@example.com");
      expect((await loadCompanyCompare(scoped(db, other.id), companyId, { doc: "recon" })).status).toBe("not_found");
    } finally {
      await close();
    }
  });

  it("documentHrefForCompany falls back to the Companies list when the company has no job", async () => {
    const { s, close } = await setup("pm3@example.com");
    try {
      expect(await documentHrefForCompany(s, "11111111-1111-4111-8111-111111111111", "recon")).toBe("/companies");
    } finally {
      await close();
    }
  });
});
