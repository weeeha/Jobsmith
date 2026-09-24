import { describe, expect, it } from "vitest";
import { makeTestDb, createTestUser } from "../helpers/db";
import { scoped } from "@/lib/db/scoped";
import { seedOpportunity, stageIdsByKind } from "../helpers/opportunity-fixture";
import { addPersonToOpportunity, updateLinkedPerson, unlinkPerson } from "@/lib/people";
import { expectOk, expectFail } from "../helpers/result";

describe("addPersonToOpportunity", () => {
  it("creates a person under the opportunity's company and links it", async () => {
    const { db, close } = await makeTestDb();
    try {
      const user = await createTestUser(db, "owner@example.com");
      const s = scoped(db, user.id);
      const { id } = await seedOpportunity(s);
      const opportunity = await s.opportunity.getById(id);

      const result = expectOk(
        await addPersonToOpportunity(s, id, { name: "Priya Raman", role: "recruiter", email: "priya@example.com" }),
      );

      const person = await s.person.getById(result.personId);
      expect(person?.companyId).toBe(opportunity!.companyId);
      const links = await s.opportunityPerson.listForOpportunity(id);
      expect(links).toHaveLength(1);
      expect(links[0].linkId).toBe(result.linkId);
      expect(links[0].role).toBe("recruiter");
    } finally {
      await close();
    }
  });

  it("accepts a stageId that belongs to this opportunity and rejects one that does not", async () => {
    const { db, close } = await makeTestDb();
    try {
      const user = await createTestUser(db, "owner2@example.com");
      const s = scoped(db, user.id);
      const first = await seedOpportunity(s, { roleTitle: "Product Designer" });
      const second = await seedOpportunity(s, { roleTitle: "Staff Designer" });
      const firstStages = await stageIdsByKind(s, first.id);
      const secondStages = await stageIdsByKind(s, second.id);

      const result = expectOk(
        await addPersonToOpportunity(s, first.id, {
          name: "Priya Raman",
          role: "interviewer",
          stageId: firstStages.recruiter_screen,
        }),
      );
      const links = await s.opportunityPerson.listForOpportunity(first.id);
      expect(links.find((l) => l.linkId === result.linkId)?.stageId).toBe(firstStages.recruiter_screen);

      expectFail(
        await addPersonToOpportunity(s, first.id, {
          name: "Someone Else",
          role: "interviewer",
          stageId: secondStages.recruiter_screen,
        }),
        "invalid",
      );
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
      expectFail(await addPersonToOpportunity(a, id, { name: "  ", role: "recruiter" }), "invalid");
      expectFail(await addPersonToOpportunity(b, id, { name: "Someone", role: "recruiter" }), "not_found");
    } finally {
      await close();
    }
  });
});

describe("updateLinkedPerson and unlinkPerson", () => {
  it("updates the person and the link's role and stage", async () => {
    const { db, close } = await makeTestDb();
    try {
      const user = await createTestUser(db, "owner3@example.com");
      const s = scoped(db, user.id);
      const { id } = await seedOpportunity(s);
      const created = expectOk(await addPersonToOpportunity(s, id, { name: "Priya Raman", role: "recruiter" }));

      expectOk(
        await updateLinkedPerson(s, id, created.linkId, {
          name: "Priya Raman-Singh",
          role: "hiring_manager",
        }),
      );

      const person = await s.person.getById(created.personId);
      expect(person?.name).toBe("Priya Raman-Singh");
      const links = await s.opportunityPerson.listForOpportunity(id);
      expect(links.find((l) => l.linkId === created.linkId)?.role).toBe("hiring_manager");
    } finally {
      await close();
    }
  });

  it("rejects an unknown link, invalid input, and unlinks a real one", async () => {
    const { db, close } = await makeTestDb();
    try {
      const user = await createTestUser(db, "owner4@example.com");
      const s = scoped(db, user.id);
      const { id } = await seedOpportunity(s);
      const created = expectOk(await addPersonToOpportunity(s, id, { name: "Priya Raman", role: "recruiter" }));

      expectFail(
        await updateLinkedPerson(s, id, "00000000-0000-0000-0000-000000000000", { name: "X", role: "recruiter" }),
        "not_found",
      );
      expectFail(await updateLinkedPerson(s, id, created.linkId, { name: "  ", role: "recruiter" }), "invalid");

      expectOk(await unlinkPerson(s, id, created.linkId));
      expect(await s.opportunityPerson.listForOpportunity(id)).toEqual([]);
      expectFail(await unlinkPerson(s, id, created.linkId), "not_found");
    } finally {
      await close();
    }
  });

  // The person dialog has no separate "clear" control either, same as Edit
  // details/Edit company - a blank optional field is
  // sent as `null` and clears the column. name and role stay required.
  it("stores null for title and email when sent as null, clearing them, but still rejects a blank name", async () => {
    const { db, close } = await makeTestDb();
    try {
      const user = await createTestUser(db, "clearer3@example.com");
      const s = scoped(db, user.id);
      const { id } = await seedOpportunity(s);
      const created = expectOk(
        await addPersonToOpportunity(s, id, {
          name: "Priya Raman",
          role: "recruiter",
          title: "Recruiter Lead",
          email: "priya@example.com",
        }),
      );

      expectOk(
        await updateLinkedPerson(s, id, created.linkId, {
          name: "Priya Raman",
          role: "recruiter",
          title: null,
          email: null,
        }),
      );

      const person = await s.person.getById(created.personId);
      expect(person?.title).toBeNull();
      expect(person?.email).toBeNull();

      expectFail(await updateLinkedPerson(s, id, created.linkId, { name: "", role: "recruiter" }), "invalid");
    } finally {
      await close();
    }
  });

  it("returns not_found for user B on user A's link", async () => {
    const { db, close } = await makeTestDb();
    try {
      const alice = await createTestUser(db, "alice2@example.com");
      const bob = await createTestUser(db, "bob2@example.com");
      const a = scoped(db, alice.id);
      const b = scoped(db, bob.id);
      const { id } = await seedOpportunity(a);
      const created = expectOk(await addPersonToOpportunity(a, id, { name: "Priya Raman", role: "recruiter" }));
      expectFail(await updateLinkedPerson(b, id, created.linkId, { name: "X", role: "recruiter" }), "not_found");
      expectFail(await unlinkPerson(b, id, created.linkId), "not_found");
    } finally {
      await close();
    }
  });
});
