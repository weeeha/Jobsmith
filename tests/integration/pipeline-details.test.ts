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

  // Ruling 1 (Task 10): a blank optional field on the Edit details form
  // means "clear this column", not "leave unchanged" - so the schema and
  // the function's input type accept `null` for every optional column.
  // roleTitle is excluded: it has no clearing gesture in the UI and stays
  // required-when-given and non-empty.
  it("stores null for location and sourceUrl when they are sent as null, clearing them", async () => {
    const { db, close } = await makeTestDb();
    try {
      const user = await createTestUser(db, "clearer@example.com");
      const s = scoped(db, user.id);
      const { id } = await seedOpportunity(s, {
        location: "Remote",
        sourceUrl: "https://example.com/job",
      });
      expectOk(await updateOpportunityDetails(s, id, { location: null, sourceUrl: null }));
      const opportunity = await s.opportunity.getById(id);
      expect(opportunity?.location).toBeNull();
      expect(opportunity?.sourceUrl).toBeNull();
    } finally {
      await close();
    }
  });

  it("still rejects a blank roleTitle (it cannot be cleared)", async () => {
    const { db, close } = await makeTestDb();
    try {
      const user = await createTestUser(db, "blanker@example.com");
      const s = scoped(db, user.id);
      const { id } = await seedOpportunity(s);
      expectFail(await updateOpportunityDetails(s, id, { roleTitle: "" }), "invalid");
      const opportunity = await s.opportunity.getById(id);
      expect(opportunity?.roleTitle).toBe("Product Designer");
    } finally {
      await close();
    }
  });

  it("still rejects compMin > compMax when both are set, but ignores either side when null", async () => {
    const { db, close } = await makeTestDb();
    try {
      const user = await createTestUser(db, "ranger@example.com");
      const s = scoped(db, user.id);
      const { id } = await seedOpportunity(s, { compMin: 100000, compMax: 150000 });
      expectOk(await updateOpportunityDetails(s, id, { compMax: null }));
      expectOk(await updateOpportunityDetails(s, id, { compMin: null, compMax: 150000 }));
      expectFail(await updateOpportunityDetails(s, id, { compMin: 200000, compMax: 100000 }), "invalid");
    } finally {
      await close();
    }
  });

  // Same Postgres `integer` overflow as createOpportunity's matching test -
  // proves the Edit details path also returns `invalid` instead of reaching
  // the database with a figure Postgres cannot store.
  it("rejects a pay figure above Postgres's integer maximum without throwing", async () => {
    const { db, close } = await makeTestDb();
    try {
      const user = await createTestUser(db, "ranger-overflow@example.com");
      const s = scoped(db, user.id);
      const { id } = await seedOpportunity(s);
      expectFail(await updateOpportunityDetails(s, id, { compMax: 3_000_000_000 }), "invalid");
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

  // Ruling 6 (Task 11): the Edit company dialog has no separate "clear"
  // control either, same as Edit details (Ruling 1, Task 10) - a blank
  // optional field is sent as `null` and clears the column, not silently
  // ignored. Every field here (domain, careersUrl, size, industry, hq,
  // notesMd) accepts `null` for exactly that reason.
  it("stores null for careersUrl and hq when sent as null, clearing them", async () => {
    const { db, close } = await makeTestDb();
    try {
      const user = await createTestUser(db, "clearer2@example.com");
      const s = scoped(db, user.id);
      const { id } = await seedOpportunity(s);
      const opportunity = await s.opportunity.getById(id);
      expectOk(
        await updateCompanyDetails(s, opportunity!.companyId, {
          careersUrl: "https://example.com/careers",
          hq: "Remote",
        }),
      );
      expectOk(await updateCompanyDetails(s, opportunity!.companyId, { careersUrl: null, hq: null }));
      const company = await s.company.getById(opportunity!.companyId);
      expect(company?.careersUrl).toBeNull();
      expect(company?.hq).toBeNull();
    } finally {
      await close();
    }
  });
});
