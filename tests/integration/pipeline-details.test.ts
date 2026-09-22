import { describe, expect, it } from "vitest";
import { makeTestDb, createTestUser } from "../helpers/db";
import { scoped } from "@/lib/db/scoped";
import { seedOpportunity } from "../helpers/opportunity-fixture";
import { updateOpportunityDetails, updateCompanyDetails } from "@/lib/pipeline/details";
import { expectOk, expectFail } from "../helpers/result";

describe("updateOpportunityDetails", () => {
  it("updates the given fields and leaves others untouched", async () => {
    const { db, close } = await makeTestDb();
    try {
      const user = await createTestUser(db, "owner@example.com");
      const s = scoped(db, user.id);
      const { id } = await seedOpportunity(s, { location: "Remote" });
      expectOk(await updateOpportunityDetails(s, id, { roleTitle: "Staff Product Designer", compMin: 140000, compMax: 180000 }));
      const opportunity = await s.opportunity.getById(id);
      expect(opportunity?.roleTitle).toBe("Staff Product Designer");
      expect(opportunity?.compMin).toBe(140000);
      expect(opportunity?.compMax).toBe(180000);
      expect(opportunity?.location).toBe("Remote");
    } finally {
      await close();
    }
  });

  it("rejects invalid input and a wrong-tenant opportunity", async () => {
    const { db, close } = await makeTestDb();
    try {
      const alice = await createTestUser(db, "alice@example.com");
      const bob = await createTestUser(db, "bob@example.com");
      const a = scoped(db, alice.id);
      const b = scoped(db, bob.id);
      const { id } = await seedOpportunity(a);
      expectFail(await updateOpportunityDetails(a, id, { compMin: 200000, compMax: 100000 }), "invalid");
      expectFail(await updateOpportunityDetails(a, id, { sourceUrl: "not-a-url" }), "invalid");
      expectFail(await updateOpportunityDetails(b, id, { roleTitle: "Hacked" }), "not_found");
    } finally {
      await close();
    }
  });
});

describe("updateCompanyDetails", () => {
  it("updates the given fields", async () => {
    const { db, close } = await makeTestDb();
    try {
      const user = await createTestUser(db, "owner2@example.com");
      const s = scoped(db, user.id);
      const { id } = await seedOpportunity(s);
      const opportunity = await s.opportunity.getById(id);
      expectOk(
        await updateCompanyDetails(s, opportunity!.companyId, {
          domain: "acme.example",
          industry: "Robotics",
        }),
      );
      const company = await s.company.getById(opportunity!.companyId);
      expect(company?.domain).toBe("acme.example");
      expect(company?.industry).toBe("Robotics");
    } finally {
      await close();
    }
  });

  it("rejects invalid input and a wrong-tenant company", async () => {
    const { db, close } = await makeTestDb();
    try {
      const alice = await createTestUser(db, "alice2@example.com");
      const bob = await createTestUser(db, "bob2@example.com");
      const a = scoped(db, alice.id);
      const b = scoped(db, bob.id);
      const { id } = await seedOpportunity(a);
      const opportunity = await a.opportunity.getById(id);
      expectFail(await updateCompanyDetails(a, opportunity!.companyId, { careersUrl: "not-a-url" }), "invalid");
      expectFail(await updateCompanyDetails(b, opportunity!.companyId, { domain: "hacked.example" }), "not_found");
    } finally {
      await close();
    }
  });
});
