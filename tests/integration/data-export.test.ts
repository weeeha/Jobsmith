import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import * as schema from "@/lib/db/schema";
import { scoped } from "@/lib/db/scoped";
import { EXPORT_FORMAT, buildExport, exportFileName } from "@/lib/export/build";
import { makeTestDb, createTestUser, seedOneOfEach } from "../helpers/db";
import { seedProfile } from "../helpers/profile";

const NOW = new Date("2026-10-11T20:30:00.000Z");

// The columns the export keeps, table by table. A column that is not on this
// list is not exported, so a new column (or a secret) never leaks by default.
const KEPT = {
  companies: ["atsKind", "atsOrg", "careersUrl", "createdAt", "domain", "hq", "id", "industry", "name", "notesMd", "size", "tracked", "updatedAt"],
  opportunities: [
    "closedAt", "closedReason", "closedStageId", "companyId", "compCurrency", "compMax", "compMin", "compNote", "createdAt",
    "currentStageId", "fit", "fitScore", "fitStatus", "id", "location", "myAsk", "needsReview", "nextAction", "nextActionAt",
    "postingCapturedAt", "postingMd", "roleTitle", "slug", "source", "sourceUrl", "status", "updatedAt", "workMode",
  ],
  stages: ["completedAt", "createdAt", "enteredAt", "format", "id", "kind", "label", "opportunityId", "outcomeMd", "position", "scheduledAt", "status", "updatedAt"],
  people: ["companyId", "createdAt", "email", "id", "linkedinUrl", "name", "notesMd", "title", "updatedAt"],
  opportunityPeople: ["createdAt", "id", "opportunityId", "personId", "role", "stageId", "updatedAt"],
  events: ["body", "createdAt", "id", "kind", "meta", "occurredAt", "opportunityId", "stageId"],
  artifacts: [
    "bodyMd", "companyId", "createdAt", "editedAt", "id", "key", "kind", "opportunityId", "origin", "sentAt", "stageId", "title", "updatedAt", "version",
  ],
  apiTokens: ["createdAt", "id", "lastUsedAt", "name", "prefix", "revokedAt"],
} as const;

async function seededExport() {
  const made = await makeTestDb();
  const user = await createTestUser(made.db, "export-owner@example.com");
  const s = scoped(made.db, user.id);
  await seedProfile(s, {
    headline: "Product designer",
    timezone: "Asia/Tokyo",
    preferences: { v: 1, titles: ["Product Designer"], compFloor: 100 },
  });
  const ids = await seedOneOfEach(s);
  await s.opportunity.update(ids.opportunityId, {
    dedupeHash: "DEDUPE-MARK",
    fitScore: 81,
    fitStatus: "done",
    fit: { v: 1, score: 81, summary: "A test summary.", pros: [], cons: [], modelId: "fake-extractor", scoredAt: NOW.toISOString() },
    postingMd: "About the job",
  });
  await s.artifact.insert({
    opportunityId: ids.opportunityId,
    companyId: null,
    stageId: null,
    key: "cv",
    version: 2,
    kind: "cv",
    title: "CV",
    bodyMd: "# CV, second version",
    contentHash: "CONTENT-MARK",
    sourceHash: "SOURCE-MARK",
    origin: "pushed",
  });
  await s.apiToken.insert({ name: "Desktop", tokenHash: "NEVER-EXPORT-TOKEN-HASH", prefix: "jsm_BBBB" });
  return { ...made, user, s, ids };
}

describe("buildExport", () => {
  it("wraps every table the user owns in one envelope", async () => {
    const { close, s, user, ids } = await seededExport();
    try {
      const doc = await buildExport(s, NOW);

      expect(doc.format).toBe(EXPORT_FORMAT);
      expect(EXPORT_FORMAT).toBe("jobsmith-export/v1");
      expect(doc.exportedAt).toBe("2026-10-11T20:30:00.000Z");
      expect(doc.user).toMatchObject({ id: user.id, name: "export-owner@example.com", email: "export-owner@example.com" });
      expect(doc.profile).toMatchObject({
        headline: "Product designer",
        timezone: "Asia/Tokyo",
        preferences: { v: 1, titles: ["Product Designer"], compFloor: 100 },
      });
      expect(doc.profile?.resumeMd).toContain("Northwind Traders");
      expect(doc.companies.map((row) => row.id)).toEqual([ids.companyId]);
      expect(doc.opportunities.map((row) => row.id)).toEqual([ids.opportunityId]);
      expect(doc.stages.map((row) => row.id)).toEqual([ids.stageId]);
      expect(doc.people.map((row) => row.id)).toEqual([ids.personId]);
      expect(doc.opportunityPeople.map((row) => row.id)).toEqual([ids.linkId]);
      expect(doc.events.map((row) => row.id)).toEqual([ids.eventId]);
      // Every version of a document is exported, not only the latest.
      expect(doc.artifacts.map((row) => row.version).sort()).toEqual([1, 2]);
      expect(doc.apiTokens.map((row) => row.name).sort()).toEqual(["Desktop", "Laptop"]);
      expect(doc.opportunities[0]).toMatchObject({ fitScore: 81, fitStatus: "done", postingMd: "About the job" });
      expect(doc.opportunities[0]?.fit).toMatchObject({ v: 1, score: 81 });
    } finally {
      await close();
    }
  });

  it("has a null profile for a user who never saved one", async () => {
    const made = await makeTestDb();
    try {
      const user = await createTestUser(made.db, "export-empty@example.com");
      const doc = await buildExport(scoped(made.db, user.id), NOW);
      expect(doc.profile).toBeNull();
      expect(doc.user?.id).toBe(user.id);
      expect(doc.companies).toEqual([]);
      expect(doc.artifacts).toEqual([]);
      expect(doc.apiTokens).toEqual([]);
    } finally {
      await made.close();
    }
  });

  it("keeps exactly the listed columns of each table and no others", async () => {
    const { close, s } = await seededExport();
    try {
      const doc = await buildExport(s, NOW);
      for (const table of Object.keys(KEPT) as (keyof typeof KEPT)[]) {
        const rows = doc[table];
        expect(rows.length, table).toBeGreaterThan(0);
        for (const row of rows) {
          expect(Object.keys(row).sort(), table).toEqual([...KEPT[table]].sort());
        }
      }
      expect(Object.keys(doc.user ?? {}).sort()).toEqual(["createdAt", "email", "id", "name"]);
      expect(Object.keys(doc.profile ?? {}).sort()).toEqual(["createdAt", "headline", "preferences", "resumeMd", "timezone", "updatedAt"]);
    } finally {
      await close();
    }
  });

  it("leaves out secrets, hashes and user ids from the JSON text", async () => {
    const { close, s } = await seededExport();
    try {
      const text = JSON.stringify(await buildExport(s, NOW));
      for (const forbidden of [
        "tokenHash",
        "NEVER-EXPORT-TOKEN-HASH",
        "seed-hash",
        "dedupeHash",
        "DEDUPE-MARK",
        "contentHash",
        "CONTENT-MARK",
        "sourceHash",
        "SOURCE-MARK",
        "nameKey",
        "rateCount",
        "rateWindowStart",
        "emailVerified",
        "userId",
        "password",
      ]) {
        expect(text, forbidden).not.toContain(forbidden);
      }
    } finally {
      await close();
    }
  });

  it("orders each table by created time, then id", async () => {
    const { close, s, db } = await seededExport();
    try {
      const second = await s.company.insert({ name: "Northwind Traders", nameKey: "northwindtraders" });
      const third = await s.company.insert({ name: "Lumen Health", nameKey: "lumenhealth" });
      const first = (await s.company.list()).find((row) => row.name === "Acme Robotics")!;
      // Created order: Northwind first, then Acme and Lumen at the same instant.
      await db.update(schema.company).set({ createdAt: new Date("2026-01-01T00:00:00.000Z") }).where(eq(schema.company.id, second.id));
      const tie = new Date("2026-02-01T00:00:00.000Z");
      await db.update(schema.company).set({ createdAt: tie }).where(eq(schema.company.id, first.id));
      await db.update(schema.company).set({ createdAt: tie }).where(eq(schema.company.id, third.id));

      const doc = await buildExport(s, NOW);

      const tied = [first.id, third.id].sort();
      expect(doc.companies.map((row) => row.id)).toEqual([second.id, ...tied]);
    } finally {
      await close();
    }
  });
});

describe("exportFileName", () => {
  it("dates the file in the profile zone, not UTC", () => {
    // 05:30 on 12 October in Tokyo is still 11 October in UTC and in New York.
    const instant = new Date("2026-10-11T20:30:00.000Z");
    expect(exportFileName(instant, "Asia/Tokyo")).toBe("jobsmith-export-2026-10-12.json");
    expect(exportFileName(instant, "UTC")).toBe("jobsmith-export-2026-10-11.json");
    expect(exportFileName(instant, "America/New_York")).toBe("jobsmith-export-2026-10-11.json");
  });
});
