import { getTableColumns } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import * as schema from "@/lib/db/schema";
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

  it("holds the six new row kinds with every column and no user id", async () => {
    const { db, close } = await makeTestDb();
    try {
      const alice = await createTestUser(db, ACCOUNT.email);
      const s = scoped(db, alice.id);
      const ids = await seedOneOfEach(s);

      const doc = await collectExport(s, ACCOUNT, NOW);
      expect(doc.prepQuestions.map((r) => r.id)).toEqual([ids.prepQuestionId]);
      expect(doc.prepMarks.map((r) => r.id)).toEqual([ids.prepMarkId]);
      expect(doc.libraryItems.map((r) => r.id)).toEqual([ids.libraryItemId]);
      expect(doc.prepSessions.map((r) => r.id)).toEqual([ids.prepSessionId]);
      expect(doc.assets.map((r) => r.id)).toEqual([ids.assetId]);
      expect(doc.ttsSegments.map((r) => r.id)).toEqual([ids.ttsSegmentId]);

      const columns = (table: Parameters<typeof getTableColumns>[0]) =>
        Object.keys(getTableColumns(table)).filter((k) => k !== "userId").sort();
      expect(Object.keys(doc.prepQuestions[0]).sort()).toEqual(columns(schema.prepQuestion));
      expect(Object.keys(doc.prepMarks[0]).sort()).toEqual(columns(schema.prepMark));
      expect(Object.keys(doc.libraryItems[0]).sort()).toEqual(columns(schema.libraryItem));
      expect(Object.keys(doc.prepSessions[0]).sort()).toEqual(columns(schema.prepSession));
      expect(Object.keys(doc.assets[0]).sort()).toEqual(columns(schema.asset));
      expect(Object.keys(doc.ttsSegments[0]).sort()).toEqual(columns(schema.ttsSegment));
      for (const rows of [doc.prepQuestions, doc.prepMarks, doc.libraryItems, doc.prepSessions, doc.assets, doc.ttsSegments]) {
        expect(JSON.stringify(rows)).not.toContain(alice.id);
        expect("userId" in rows[0]).toBe(false);
      }
      expect(doc.version).toBe(1);
    } finally {
      await close();
    }
  });

  it("assets are metadata only: no bytes, no base64, no storage payload", async () => {
    const { db, close } = await makeTestDb();
    try {
      const alice = await createTestUser(db, ACCOUNT.email);
      const s = scoped(db, alice.id);
      await seedOneOfEach(s);

      const doc = await collectExport(s, ACCOUNT, NOW);
      // The columns are a size count, a hash and a storage key: no column holds content.
      expect(Object.keys(doc.assets[0]).sort()).toEqual(
        ["bytes", "contentType", "createdAt", "durationMs", "id", "kind", "opportunityId", "sha256", "storageKey", "updatedAt"],
      );
      expect(typeof doc.assets[0].bytes).toBe("number");
      for (const value of Object.values(doc.assets[0])) {
        if (typeof value === "string") expect(value.length).toBeLessThan(200);
        expect(Buffer.isBuffer(value) || value instanceof Uint8Array).toBe(false);
      }
      expect(JSON.stringify(doc.assets)).not.toMatch(/base64|data:audio/i);
    } finally {
      await close();
    }
  });

  it("never holds another user's prep rows, marks, items, sessions, assets or segments", async () => {
    const { db, close } = await makeTestDb();
    try {
      const alice = await createTestUser(db, ACCOUNT.email);
      const bob = await createTestUser(db, "export-bob@example.com");
      const aliceIds = await seedOneOfEach(scoped(db, alice.id));
      const bobIds = await seedOneOfEach(scoped(db, bob.id));

      const doc = await collectExport(scoped(db, alice.id), ACCOUNT, NOW);
      expect(doc.prepQuestions.map((r) => r.id)).toEqual([aliceIds.prepQuestionId]);
      expect(doc.prepMarks.map((r) => r.id)).toEqual([aliceIds.prepMarkId]);
      expect(doc.libraryItems.map((r) => r.id)).toEqual([aliceIds.libraryItemId]);
      expect(doc.prepSessions.map((r) => r.id)).toEqual([aliceIds.prepSessionId]);
      expect(doc.assets.map((r) => r.id)).toEqual([aliceIds.assetId]);
      expect(doc.ttsSegments.map((r) => r.id)).toEqual([aliceIds.ttsSegmentId]);
      const json = JSON.stringify([doc.prepQuestions, doc.prepMarks, doc.libraryItems, doc.prepSessions, doc.assets, doc.ttsSegments]);
      for (const id of [bobIds.prepQuestionId, bobIds.prepMarkId, bobIds.libraryItemId, bobIds.prepSessionId, bobIds.assetId, bobIds.ttsSegmentId]) {
        expect(json).not.toContain(id);
      }
      expect(json).not.toContain(bob.id);
    } finally {
      await close();
    }
  });

  it("names the file after the export date", () => {
    expect(exportFileName(NOW)).toBe("jobsmith-export-2026-10-16.json");
  });
});
