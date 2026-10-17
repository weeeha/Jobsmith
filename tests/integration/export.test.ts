import { describe, expect, it } from "vitest";
import { makeTestDb, createTestUser, seedOneOfEach } from "../helpers/db";
import { scoped } from "@/lib/db/scoped";
import { collectExport, exportFileName } from "@/lib/export/collect";

const NOW = new Date("2026-10-16T09:00:00.000Z");
const ACCOUNT = { email: "export-alice@example.com", name: "Alice", createdAt: new Date("2026-09-20T10:00:00.000Z") };

describe("collectExport", () => {
  it("holds every kind of row the user owns, with all document versions", async () => {
    const { db, close } = await makeTestDb();
    try {
      const alice = await createTestUser(db, ACCOUNT.email);
      const s = scoped(db, alice.id);
      const ids = await seedOneOfEach(s);
      await s.artifact.insert({
        opportunityId: ids.opportunityId, companyId: null, stageId: null, key: "cv", version: 2, kind: "cv",
        title: "CV", bodyMd: "# CV v2", contentHash: "seed-hash-2", sourceHash: "seed-hash-2", origin: "pushed",
      });
      await s.profile.upsert({ headline: "Designer", resumeMd: "# Resume", timezone: "Europe/Berlin" });

      const doc = await collectExport(s, ACCOUNT, NOW);
      expect(doc.format).toBe("jobsmith-export");
      expect(doc.exportedAt).toBe("2026-10-16T09:00:00.000Z");
      expect(doc.account.email).toBe(ACCOUNT.email);
      expect(doc.profile?.headline).toBe("Designer");
      expect(doc.profile?.preferences.scoreThreshold).toBe(70);
      expect(doc.companies.map((c) => c.id)).toEqual([ids.companyId]);
      expect(doc.opportunities.map((o) => o.id)).toEqual([ids.opportunityId]);
      expect(doc.stages.map((st) => st.id)).toEqual([ids.stageId]);
      expect(doc.people.map((p) => p.id)).toEqual([ids.personId]);
      expect(doc.opportunityPeople.map((l) => l.id)).toEqual([ids.linkId]);
      expect(doc.events.map((e) => e.id)).toEqual([ids.eventId]);
      expect(doc.artifacts.map((a) => a.version)).toEqual([1, 2]);
      expect(doc.apiTokens).toEqual([
        expect.objectContaining({ name: "Laptop", prefix: "jsm_AAAA", lastUsedAt: null, revokedAt: null }),
      ]);
    } finally {
      await close();
    }
  });

  it("never holds another user's rows or any secret field", async () => {
    const { db, close } = await makeTestDb();
    try {
      const alice = await createTestUser(db, ACCOUNT.email);
      const bob = await createTestUser(db, "export-bob@example.com");
      await seedOneOfEach(scoped(db, alice.id));
      const bobIds = await seedOneOfEach(scoped(db, bob.id));

      const doc = await collectExport(scoped(db, alice.id), ACCOUNT, NOW);
      const json = JSON.stringify(doc);
      for (const id of Object.values(bobIds)) expect(json).not.toContain(id);
      expect(json).not.toContain(bob.id);
      expect(json).not.toContain(alice.id);
      for (const secret of ["tokenHash", "token_hash", "rateCount", "rateWindowStart", "password"]) {
        expect(json).not.toContain(secret);
      }
    } finally {
      await close();
    }
  });

  it("names the file after the export date", () => {
    expect(exportFileName(NOW)).toBe("jobsmith-export-2026-10-16.json");
  });
});
