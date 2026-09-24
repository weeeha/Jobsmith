import { describe, expect, it } from "vitest";
import { makeTestDb, createTestUser, seedOneOfEach, type SeededIds } from "../helpers/db";
import { scoped, type Scoped } from "@/lib/db/scoped";

type Case = {
  name: string;
  run: (a: Scoped, b: Scoped, ids: SeededIds) => Promise<void>;
};

const cases: Case[] = [
  {
    name: "company.getById hides A's row from B",
    run: async (a, b, ids) => {
      expect(await b.company.getById(ids.companyId)).toBeNull();
      expect(await a.company.getById(ids.companyId)).not.toBeNull();
    },
  },
  {
    name: "company.findByNameKey hides A's row from B",
    run: async (a, b) => {
      expect(await b.company.findByNameKey("acmerobotics")).toBeNull();
      expect(await a.company.findByNameKey("acmerobotics")).not.toBeNull();
    },
  },
  {
    name: "company.list excludes A's rows for B",
    run: async (a, b) => {
      expect(await b.company.list()).toEqual([]);
      expect((await a.company.list()).length).toBeGreaterThan(0);
    },
  },
  {
    name: "company.update cannot touch A's row from B",
    run: async (a, b, ids) => {
      expect(await b.company.update(ids.companyId, { name: "Hacked" })).toBeNull();
      expect((await a.company.getById(ids.companyId))?.name).toBe("Acme Robotics");
    },
  },
  {
    name: "company.insert ignores a smuggled userId",
    run: async (a, b) => {
      const row = await a.company.insert({
        name: "Northwind Labs",
        nameKey: "northwindlabs",
        userId: b.userId,
      } as never);
      expect(row.userId).toBe(a.userId);
      expect(await b.company.findByNameKey("northwindlabs")).toBeNull();
    },
  },
  {
    name: "opportunity.getById and getBySlug hide A's row from B",
    run: async (a, b, ids) => {
      expect(await b.opportunity.getById(ids.opportunityId)).toBeNull();
      const row = await a.opportunity.getById(ids.opportunityId);
      expect(row).not.toBeNull();
      expect(await b.opportunity.getBySlug(row!.slug)).toBeNull();
      expect(await a.opportunity.getBySlug(row!.slug)).not.toBeNull();
    },
  },
  {
    name: "opportunity.lockById hides A's row from B and returns A's row inside a transaction",
    run: async (a, b, ids) => {
      expect(await b.opportunity.lockById(ids.opportunityId)).toBeNull();
      const locked = await a.transaction(async (tx) => tx.opportunity.lockById(ids.opportunityId));
      expect(locked?.id).toBe(ids.opportunityId);
    },
  },
  {
    name: "opportunity.listBoard and listClosed exclude A's rows for B",
    run: async (a, b) => {
      expect(await b.opportunity.listBoard()).toEqual([]);
      expect(await b.opportunity.listClosed()).toEqual([]);
      expect((await a.opportunity.listBoard()).length).toBeGreaterThan(0);
    },
  },
  {
    name: "opportunity.listSlugsWithPrefix excludes A's slugs for B",
    run: async (a, b) => {
      expect(await b.opportunity.listSlugsWithPrefix("acme-designer")).toEqual([]);
      expect((await a.opportunity.listSlugsWithPrefix("acme-designer")).length).toBeGreaterThan(0);
    },
  },
  {
    name: "opportunity.findByCompanyAndRole hides A's row from B",
    run: async (a, b, ids) => {
      expect(await b.opportunity.findByCompanyAndRole(ids.companyId, "Product Designer")).toBeNull();
      expect(await a.opportunity.findByCompanyAndRole(ids.companyId, "Product Designer")).not.toBeNull();
    },
  },
  {
    name: "opportunity.update cannot touch A's row from B",
    run: async (a, b, ids) => {
      expect(await b.opportunity.update(ids.opportunityId, { roleTitle: "Hacked" })).toBeNull();
      expect((await a.opportunity.getById(ids.opportunityId))?.roleTitle).toBe("Product Designer");
    },
  },
  {
    name: "opportunity.insert ignores a smuggled userId",
    run: async (a, b, ids) => {
      const row = await a.opportunity.insert({
        companyId: ids.companyId,
        slug: "smuggled-insert-test",
        roleTitle: "Smuggled",
        userId: b.userId,
      } as never);
      expect(row.userId).toBe(a.userId);
      expect(await b.opportunity.getBySlug("smuggled-insert-test")).toBeNull();
    },
  },
  {
    name: "stage.listForOpportunity returns empty for B",
    run: async (a, b, ids) => {
      expect(await b.stage.listForOpportunity(ids.opportunityId)).toEqual([]);
      expect((await a.stage.listForOpportunity(ids.opportunityId)).length).toBeGreaterThan(0);
    },
  },
  {
    name: "stage.update and remove cannot touch A's row from B",
    run: async (a, b, ids) => {
      expect(await b.stage.update(ids.stageId, { label: "Hacked" })).toBeNull();
      expect(await b.stage.remove(ids.stageId)).toBeNull();
      const stages = await a.stage.listForOpportunity(ids.opportunityId);
      expect(stages.find((s) => s.id === ids.stageId)?.label).toBe("Saved");
    },
  },
  {
    name: "stage.insert and insertMany ignore a smuggled userId",
    run: async (a, b, ids) => {
      const one = await a.stage.insert({
        opportunityId: ids.opportunityId,
        kind: "applied",
        label: "Applied",
        position: 1,
        userId: b.userId,
      } as never);
      expect(one.userId).toBe(a.userId);
      const many = await a.stage.insertMany([
        { opportunityId: ids.opportunityId, kind: "offer", label: "Offer", position: 2, userId: b.userId } as never,
      ]);
      expect(many[0].userId).toBe(a.userId);
      expect(await b.stage.listForOpportunity(ids.opportunityId)).toEqual([]);
    },
  },
  {
    name: "stage.renumber reorders five stages with no gaps or duplicates",
    run: async (a, b, ids) => {
      void b;
      const extra = await Promise.all(
        [1, 2, 3, 4].map((position) =>
          a.stage.insert({ opportunityId: ids.opportunityId, kind: "applied", label: `S${position}`, position }),
        ),
      );
      const all = [ids.stageId, ...extra.map((s) => s.id)];
      const reversed = [...all].reverse();
      await a.stage.renumber(ids.opportunityId, reversed);
      const after = await a.stage.listForOpportunity(ids.opportunityId);
      const positions = reversed.map((id) => after.find((s) => s.id === id)!.position);
      expect(positions).toEqual([0, 1, 2, 3, 4]);
      expect(new Set(after.map((s) => s.position)).size).toBe(5);
    },
  },
  {
    name: "stage.renumber places an inserted stage in the middle",
    run: async (a, b, ids) => {
      void b;
      const extra = await Promise.all(
        [1, 2, 3, 4].map((position) =>
          a.stage.insert({ opportunityId: ids.opportunityId, kind: "applied", label: `S${position}`, position }),
        ),
      );
      const existing = [ids.stageId, ...extra.map((s) => s.id)];
      const inserted = await a.stage.insert({
        opportunityId: ids.opportunityId,
        kind: "panel_final",
        label: "Panel",
        position: 99,
      });
      const order = [...existing.slice(0, 2), inserted.id, ...existing.slice(2)];
      await a.stage.renumber(ids.opportunityId, order);
      const after = await a.stage.listForOpportunity(ids.opportunityId);
      expect(after.find((s) => s.id === inserted.id)?.position).toBe(2);
      expect(new Set(after.map((s) => s.position)).size).toBe(6);
      expect(Math.max(...after.map((s) => s.position))).toBe(5);
    },
  },
  {
    name: "person.getById and listForCompany hide A's rows from B",
    run: async (a, b, ids) => {
      expect(await b.person.getById(ids.personId)).toBeNull();
      expect(await b.person.listForCompany(ids.companyId)).toEqual([]);
      expect((await a.person.listForCompany(ids.companyId)).length).toBeGreaterThan(0);
    },
  },
  {
    name: "person.update cannot touch A's row from B",
    run: async (a, b, ids) => {
      expect(await b.person.update(ids.personId, { name: "Hacked" })).toBeNull();
      expect((await a.person.getById(ids.personId))?.name).toBe("Priya Raman");
    },
  },
  {
    name: "person.insert ignores a smuggled userId",
    run: async (a, b, ids) => {
      const row = await a.person.insert({
        companyId: ids.companyId,
        name: "Second Person",
        userId: b.userId,
      } as never);
      expect(row.userId).toBe(a.userId);
      expect(await b.person.listForCompany(ids.companyId)).toEqual([]);
    },
  },
  {
    name: "opportunityPerson.listForOpportunity hides A's link from B",
    run: async (a, b, ids) => {
      expect(await b.opportunityPerson.listForOpportunity(ids.opportunityId)).toEqual([]);
      expect((await a.opportunityPerson.listForOpportunity(ids.opportunityId)).length).toBeGreaterThan(0);
    },
  },
  {
    name: "opportunityPerson.update and unlink cannot touch A's row from B",
    run: async (a, b, ids) => {
      expect(await b.opportunityPerson.update(ids.linkId, { role: "referrer" })).toBeNull();
      expect(await b.opportunityPerson.unlink(ids.linkId)).toBeNull();
      const links = await a.opportunityPerson.listForOpportunity(ids.opportunityId);
      expect(links.find((l) => l.linkId === ids.linkId)?.role).toBe("recruiter");
    },
  },
  {
    name: "opportunityPerson.link ignores a smuggled userId",
    run: async (a, b, ids) => {
      const person = await a.person.insert({ companyId: ids.companyId, name: "Third Person" });
      const link = await a.opportunityPerson.link({
        opportunityId: ids.opportunityId,
        personId: person.id,
        role: "referrer",
        userId: b.userId,
      } as never);
      expect(link.userId).toBe(a.userId);
    },
  },
  {
    name: "event.listForOpportunity hides A's events from B",
    run: async (a, b, ids) => {
      expect(await b.event.listForOpportunity(ids.opportunityId)).toEqual([]);
      expect((await a.event.listForOpportunity(ids.opportunityId)).length).toBeGreaterThan(0);
    },
  },
  {
    name: "event.insert ignores a smuggled userId",
    run: async (a, b, ids) => {
      const row = await a.event.insert({
        opportunityId: ids.opportunityId,
        kind: "note",
        userId: b.userId,
      } as never);
      expect(row.userId).toBe(a.userId);
    },
  },
];

describe("scoped tenant isolation", () => {
  for (const testCase of cases) {
    it(testCase.name, async () => {
      const { db, close } = await makeTestDb();
      try {
        const userA = await createTestUser(db, `a-${Math.random().toString(36).slice(2)}@example.com`);
        const userB = await createTestUser(db, `b-${Math.random().toString(36).slice(2)}@example.com`);
        const a = scoped(db, userA.id);
        const b = scoped(db, userB.id);
        const ids = await seedOneOfEach(a);
        await testCase.run(a, b, ids);
      } finally {
        await close();
      }
    });
  }
});
