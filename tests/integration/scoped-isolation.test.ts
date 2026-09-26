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
    name: "opportunity.listActiveForDedupe excludes A's rows for B",
    run: async (a, b, ids) => {
      void ids;
      expect(await b.opportunity.listActiveForDedupe()).toEqual([]);
      expect((await a.opportunity.listActiveForDedupe()).length).toBeGreaterThan(0);
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
  {
    name: "artifact.listLatestForOpportunity and listVersions hide A's rows from B",
    run: async (a, b, ids) => {
      expect(await b.artifact.listLatestForOpportunity(ids.opportunityId)).toEqual([]);
      expect(await b.artifact.listVersions({ opportunityId: ids.opportunityId }, "cv")).toEqual([]);
      expect((await a.artifact.listLatestForOpportunity(ids.opportunityId)).length).toBeGreaterThan(0);
    },
  },
  {
    name: "artifact.listLatestForCompany hides A's company-scoped rows from B",
    run: async (a, b, ids) => {
      await a.artifact.insert({
        opportunityId: null,
        companyId: ids.companyId,
        stageId: null,
        key: "recon",
        version: 1,
        kind: "research",
        title: "Recon",
        bodyMd: "# Recon",
        contentHash: "h",
        sourceHash: "h",
        origin: "pushed",
      });
      expect(await b.artifact.listLatestForCompany(ids.companyId)).toEqual([]);
      expect((await a.artifact.listLatestForCompany(ids.companyId)).length).toBeGreaterThan(0);
    },
  },
  {
    name: "artifact.getVersion and getLatest hide A's row from B",
    run: async (a, b, ids) => {
      expect(await b.artifact.getVersion({ opportunityId: ids.opportunityId }, "cv", 1)).toBeNull();
      expect(await b.artifact.getLatest({ opportunityId: ids.opportunityId }, "cv")).toBeNull();
      expect(await a.artifact.getLatest({ opportunityId: ids.opportunityId }, "cv")).not.toBeNull();
    },
  },
  {
    name: "artifact.listKeys excludes A's keys for B",
    run: async (a, b, ids) => {
      expect(await b.artifact.listKeys({ opportunityId: ids.opportunityId })).toEqual([]);
      expect(await a.artifact.listKeys({ opportunityId: ids.opportunityId })).toEqual(["cv"]);
    },
  },
  {
    name: "artifact.update cannot touch A's row from B",
    run: async (a, b, ids) => {
      expect(await b.artifact.update(ids.artifactId, { title: "Hacked" })).toBeNull();
      expect((await a.artifact.getVersion({ opportunityId: ids.opportunityId }, "cv", 1))?.title).toBe("CV");
    },
  },
  {
    name: "artifact.insert ignores a smuggled userId and is rejected when it points at B's opportunity",
    run: async (a, b, ids) => {
      const row = await a.artifact.insert({
        opportunityId: ids.opportunityId,
        companyId: null,
        stageId: null,
        key: "cover-letter",
        version: 1,
        kind: "cover_letter",
        title: "Cover letter",
        bodyMd: "# Cover letter",
        contentHash: "h2",
        sourceHash: "h2",
        origin: "pushed",
        userId: b.userId,
      } as never);
      expect(row.userId).toBe(a.userId);

      const bIds = await seedOneOfEach(b);
      await expect(
        a.artifact.insert({
          opportunityId: bIds.opportunityId,
          companyId: null,
          stageId: null,
          key: "smuggled",
          version: 1,
          kind: "cv",
          title: "Smuggled",
          bodyMd: "# x",
          contentHash: "h3",
          sourceHash: "h3",
          origin: "pushed",
        }),
      ).rejects.toThrow();
    },
  },
  {
    name: "apiToken.list excludes A's tokens for B and never selects the hash",
    run: async (a, b, ids) => {
      expect(await b.apiToken.list()).toEqual([]);
      const tokens = await a.apiToken.list();
      expect(tokens.find((t) => t.id === ids.apiTokenId)).toBeDefined();
      expect(tokens[0]).not.toHaveProperty("tokenHash");
    },
  },
  {
    name: "apiToken.revoke cannot touch A's token from B, and is idempotent for A",
    run: async (a, b, ids) => {
      expect(await b.apiToken.revoke(ids.apiTokenId, new Date())).toBeNull();
      const now = new Date("2026-09-19T12:00:00.000Z");
      const first = await a.apiToken.revoke(ids.apiTokenId, now);
      expect(first?.revokedAt?.toISOString()).toBe(now.toISOString());
      const second = await a.apiToken.revoke(ids.apiTokenId, new Date("2026-09-20T00:00:00.000Z"));
      expect(second?.revokedAt?.toISOString()).toBe(now.toISOString());
    },
  },
  {
    name: "apiToken.insert ignores a smuggled userId",
    run: async (a, b, ids) => {
      void ids;
      const row = await a.apiToken.insert({ name: "Phone", tokenHash: `phone-${a.userId}`, prefix: "jsm_BBBB", userId: b.userId } as never);
      expect(row).not.toHaveProperty("tokenHash");
      const list = await a.apiToken.list();
      expect(list.find((t) => t.name === "Phone")).toBeDefined();
      expect(await b.apiToken.list()).toEqual([]);
    },
  },
  {
    name: "opportunity.listSlugsForCompany excludes A's slugs for B",
    run: async (a, b, ids) => {
      expect(await b.opportunity.listSlugsForCompany(ids.companyId)).toEqual([]);
      expect(await a.opportunity.listSlugsForCompany(ids.companyId)).toEqual(
        expect.arrayContaining([expect.stringContaining("acme-designer")]),
      );
    },
  },
  {
    name: "opportunity.listSummaries excludes A's rows for B, for every status",
    run: async (a, b, ids) => {
      void ids;
      expect(await b.opportunity.listSummaries("active")).toEqual([]);
      expect(await b.opportunity.listSummaries("closed")).toEqual([]);
      expect(await b.opportunity.listSummaries("all")).toEqual([]);
      const active = await a.opportunity.listSummaries("active");
      expect(active.length).toBeGreaterThan(0);
      expect(active[0]).toMatchObject({ companyName: "Acme Robotics", roleTitle: "Product Designer" });
    },
  },
  {
    name: "company.lockById hides A's row from B and returns A's row inside a transaction",
    run: async (a, b, ids) => {
      expect(await b.company.lockById(ids.companyId)).toBeNull();
      const locked = await a.transaction(async (tx) => tx.company.lockById(ids.companyId));
      expect(locked?.id).toBe(ids.companyId);
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
