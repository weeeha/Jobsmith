import { describe, expect, it } from "vitest";
import { makeTestDb, createTestUser } from "../helpers/db";
import { scoped } from "@/lib/db/scoped";
import { seedOpportunity, FIXTURE_NOW } from "../helpers/opportunity-fixture";
import { closeOpportunity } from "@/lib/pipeline/close";
import { loadCompanyOverviews } from "@/lib/companies/load";

describe("loadCompanyOverviews", () => {
  it("gives a company's active job, closed job and shared research as one view model", async () => {
    const { db, close } = await makeTestDb();
    try {
      const user = await createTestUser(db, "owner@example.com");
      const s = scoped(db, user.id);

      const active = await seedOpportunity(s, { companyName: "Acme Robotics", roleTitle: "Product Designer" });
      const closed = await seedOpportunity(s, { companyName: "Acme Robotics", roleTitle: "Support Engineer" });
      await closeOpportunity(s, closed.id, "rejected", FIXTURE_NOW);

      const activeRow = await s.opportunity.getById(active.id);
      const companyId = activeRow!.companyId;
      await s.artifact.insert({
        opportunityId: null,
        companyId,
        stageId: null,
        key: "recon",
        version: 1,
        kind: "research",
        title: "Company recon",
        bodyMd: "# Recon",
        contentHash: "seed-hash",
        sourceHash: "seed-hash",
        origin: "pushed",
      });

      const overviews = await loadCompanyOverviews(s);

      expect(overviews).toHaveLength(1);
      const [company] = overviews;
      expect(company.name).toBe("Acme Robotics");
      expect(company.jobs).toEqual([
        { slug: active.slug, roleTitle: "Product Designer", stageLabel: "Saved" },
        { slug: closed.slug, roleTitle: "Support Engineer", stageLabel: "Closed" },
      ]);
      expect(company.research).toEqual([{ key: "recon", title: "Company recon", jobSlug: active.slug }]);
    } finally {
      await close();
    }
  });

  it("returns an empty list for a user with no companies", async () => {
    const { db, close } = await makeTestDb();
    try {
      const user = await createTestUser(db, "empty@example.com");
      const s = scoped(db, user.id);
      expect(await loadCompanyOverviews(s)).toEqual([]);
    } finally {
      await close();
    }
  });

  it("excludes another user's companies", async () => {
    const { db, close } = await makeTestDb();
    try {
      const alice = await createTestUser(db, "alice@example.com");
      const bob = await createTestUser(db, "bob@example.com");
      const a = scoped(db, alice.id);
      const b = scoped(db, bob.id);
      await seedOpportunity(a, { companyName: "Acme Robotics", roleTitle: "Product Designer" });
      expect(await loadCompanyOverviews(b)).toEqual([]);
    } finally {
      await close();
    }
  });
});
