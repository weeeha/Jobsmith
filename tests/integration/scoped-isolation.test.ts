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
    name: "opportunity.settleFitStatusIfPending cannot touch A's job from B",
    run: async (a, b, ids) => {
      await a.opportunity.update(ids.opportunityId, { fitStatus: "pending" });
      expect(await b.opportunity.settleFitStatusIfPending(ids.opportunityId, "failed")).toBe(false);
      expect((await a.opportunity.getById(ids.opportunityId))?.fitStatus).toBe("pending");
      expect(await a.opportunity.settleFitStatusIfPending(ids.opportunityId, "failed")).toBe(true);
      expect((await a.opportunity.getById(ids.opportunityId))?.fitStatus).toBe("failed");
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
    name: "artifact.opportunityIdsWithKinds never reports A's jobs to B",
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
      expect(await b.artifact.opportunityIdsWithKinds(["research", "cv"])).toEqual(new Set());
      expect(await a.artifact.opportunityIdsWithKinds(["research"])).toEqual(new Set([ids.opportunityId]));
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
  {
    name: "prepQuestion.listForJob and listByQuestionKey hide A's rows from B",
    run: async (a, b, ids) => {
      expect(await b.prepQuestion.listForJob(ids.opportunityId)).toEqual([]);
      expect(await b.prepQuestion.listByQuestionKey("0123456789abcdef")).toEqual([]);
      expect(await b.prepQuestion.listAll()).toEqual([]);
      expect(await a.prepQuestion.listForJob(ids.opportunityId)).toHaveLength(1);
      expect((await b.prepQuestion.countsByOpportunity()).size).toBe(0);
    },
  },
  {
    name: "prepQuestion.replaceForArtifactKey cannot delete A's rows from B",
    run: async (a, b, ids) => {
      expect(await b.prepQuestion.replaceForArtifactKey(ids.opportunityId, "cv", [])).toBe(0);
      expect(await a.prepQuestion.listForJob(ids.opportunityId)).toHaveLength(1);
    },
  },
  {
    name: "prepMark.listForJob, find and listForQuestionKey hide A's rows from B",
    run: async (a, b, ids) => {
      expect(await b.prepMark.listForJob(ids.opportunityId)).toEqual([]);
      expect(await b.prepMark.find("job", ids.opportunityId, "0123456789abcdef")).toBeNull();
      expect(await b.prepMark.listForQuestionKey("0123456789abcdef")).toEqual([]);
      expect((await b.prepMark.levelsByOpportunity()).size).toBe(0);
      expect(await a.prepMark.find("job", ids.opportunityId, "0123456789abcdef")).not.toBeNull();
    },
  },
  {
    name: "prepMark.applyMark from B never changes A's mark",
    run: async (a, b, ids) => {
      // B's own library mark under the same key is a different row.
      const { row } = await b.prepMark.applyMark({
        scope: "library",
        opportunityId: null,
        questionKey: "0123456789abcdef",
        level: "shaky",
        markedAt: new Date("2030-01-01T00:00:00Z"),
        drilled: true,
      });
      expect(row.userId).toBe(b.userId);
      const mine = await a.prepMark.find("job", ids.opportunityId, "0123456789abcdef");
      expect(mine?.level).toBe("okay");
      expect(mine?.drillCount).toBe(0);
    },
  },
  {
    name: "prepMark.applyMark ignores a smuggled userId in its input",
    run: async (a, b) => {
      const { row } = await a.prepMark.applyMark({
        scope: "library",
        opportunityId: null,
        questionKey: "fedcba9876543210",
        level: "solid",
        markedAt: new Date("2026-11-02T00:00:00Z"),
        drilled: false,
        userId: b.userId,
      } as never);
      expect(row.userId).toBe(a.userId);
      expect(await b.prepMark.listLibrary()).toEqual([]);
    },
  },
  {
    name: "prepSession.getById and listForJob hide A's rows from B",
    run: async (a, b, ids) => {
      expect(await b.prepSession.getById(ids.prepSessionId)).toBeNull();
      expect(await b.prepSession.listForJob(ids.opportunityId)).toEqual([]);
      expect(await b.prepSession.update(ids.prepSessionId, { questions: 99 })).toBeNull();
      expect((await a.prepSession.getById(ids.prepSessionId))?.questions).toBe(0);
    },
  },
  {
    name: "libraryItem.getById, list and findBySource hide A's rows from B",
    run: async (a, b, ids) => {
      expect(await b.libraryItem.getById(ids.libraryItemId)).toBeNull();
      expect(await b.libraryItem.list({ includeArchived: true })).toEqual([]);
      expect(await b.libraryItem.findBySource("0123456789abcdef", null)).toBeNull();
      expect(await b.libraryItem.update(ids.libraryItemId, { title: "Hacked" })).toBeNull();
      expect((await a.libraryItem.getById(ids.libraryItemId))?.title).toBe("Intro");
    },
  },
  {
    name: "asset.getById and delete cannot reach A's row from B; totals counts only the caller's",
    run: async (a, b, ids) => {
      expect(await b.asset.getById(ids.assetId)).toBeNull();
      expect(await b.asset.delete(ids.assetId)).toBeNull();
      expect(await b.asset.totals()).toEqual({ bytes: 0, clips: 0 });
      expect(await a.asset.totals()).toEqual({ bytes: 100, clips: 1 });
      expect(await a.asset.getById(ids.assetId)).not.toBeNull();
    },
  },
  {
    name: "ttsSegment.listByHashes hides A's rows from B and insert ignores a smuggled userId",
    run: async (a, b) => {
      const [seeded] = await a.ttsSegment.listAll();
      expect(await b.ttsSegment.listByHashes([seeded.hash])).toEqual([]);
      expect(await b.ttsSegment.deleteByIds([seeded.id])).toBe(0);
      const row = await a.ttsSegment.insert({
        hash: "smuggled0000000a",
        provider: "fake",
        model: "fake",
        voice: "v",
        style: "v1",
        textChars: 3,
        userId: b.userId,
      } as never);
      expect(row?.userId).toBe(a.userId);
      expect(await b.ttsSegment.listByHashes(["smuggled0000000a"])).toEqual([]);
      expect(await b.ttsSegment.statusCounts()).toEqual({ pending: 0, done: 0, failed: 0 });
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
