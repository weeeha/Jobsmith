import { describe, expect, it } from "vitest";
import { makeTestDb, createTestUser } from "../helpers/db";
import { scoped } from "@/lib/db/scoped";
import { createOpportunity } from "@/lib/pipeline/create";
import { upsertArtifacts } from "@/lib/artifacts/upsert";
import { markArtifactSent } from "@/lib/artifacts/sent";
import { expectOk, expectFail } from "../helpers/result";

async function setup(email: string) {
  const { db, close } = await makeTestDb();
  const user = await createTestUser(db, email);
  const s = scoped(db, user.id);
  const created = expectOk(await createOpportunity(s, { companyName: "Northwind Labs", roleTitle: "Designer" }));
  await upsertArtifacts(
    s,
    created.id,
    [
      { key: "cv", kind: "cv", title: "My CV", scope: "opportunity", stage: null, bodyMd: "# CV\nBody" },
      { key: "call-card", kind: "call_card", title: null, scope: "opportunity", stage: null, bodyMd: "# Call card\nBody" },
    ],
    { origin: "pushed", now: new Date("2026-01-01T00:00:00Z") },
  );
  return { s, close, opportunityId: created.id };
}

describe("markArtifactSent", () => {
  it("sets sentAt, writes one document_sent event, and returns the title", async () => {
    const { s, close, opportunityId } = await setup("sent1@example.com");
    try {
      const result = expectOk(await markArtifactSent(s, opportunityId, "cv", 1, new Date("2026-01-02T00:00:00Z")));
      expect(result.title).toBe("My CV");
      const row = await s.artifact.getVersion({ opportunityId }, "cv", 1);
      expect(row?.sentAt?.toISOString()).toBe("2026-01-02T00:00:00.000Z");
      const events = await s.event.listForOpportunity(opportunityId);
      expect(events.filter((e) => e.kind === "document_sent")).toHaveLength(1);
    } finally {
      await close();
    }
  });

  it("a second call on the same version is already_sent", async () => {
    const { s, close, opportunityId } = await setup("sent2@example.com");
    try {
      await markArtifactSent(s, opportunityId, "cv", 1, new Date("2026-01-02T00:00:00Z"));
      expectFail(await markArtifactSent(s, opportunityId, "cv", 1), "already_sent");
    } finally {
      await close();
    }
  });

  it("a call card cannot be marked as sent", async () => {
    const { s, close, opportunityId } = await setup("sent3@example.com");
    try {
      expectFail(await markArtifactSent(s, opportunityId, "call-card", 1), "not_sendable");
    } finally {
      await close();
    }
  });

  it("returns artifact_not_found for a version that does not exist", async () => {
    const { s, close, opportunityId } = await setup("sent4@example.com");
    try {
      expectFail(await markArtifactSent(s, opportunityId, "cv", 99), "artifact_not_found");
    } finally {
      await close();
    }
  });

  it("marking an older, unsent version sent leaves a newer unsent version untouched", async () => {
    const { s, close, opportunityId } = await setup("sent5@example.com");
    try {
      await upsertArtifacts(
        s,
        opportunityId,
        [{ key: "cv", kind: "cv", title: "My CV", scope: "opportunity", stage: null, bodyMd: "# CV\nUpdated" }],
        { origin: "pushed", now: new Date("2026-01-02T00:00:00Z") },
      );
      const v2Before = await s.artifact.getVersion({ opportunityId }, "cv", 2);
      const result = expectOk(await markArtifactSent(s, opportunityId, "cv", 1, new Date("2026-01-03T00:00:00Z")));
      expect(result.title).toBe("My CV");
      const v1 = await s.artifact.getVersion({ opportunityId }, "cv", 1);
      expect(v1?.sentAt?.toISOString()).toBe("2026-01-03T00:00:00.000Z");
      const events = await s.event.listForOpportunity(opportunityId);
      expect(events.filter((e) => e.kind === "document_sent")).toHaveLength(1);
      const v2After = await s.artifact.getVersion({ opportunityId }, "cv", 2);
      expect(v2After?.sentAt).toBeNull();
      expect(v2After).toEqual(v2Before);
    } finally {
      await close();
    }
  });

  it("returns not_found for user B on user A's job", async () => {
    const { db, close } = await makeTestDb();
    try {
      const alice = await createTestUser(db, "alice-sent@example.com");
      const bob = await createTestUser(db, "bob-sent@example.com");
      const a = scoped(db, alice.id);
      const b = scoped(db, bob.id);
      const created = expectOk(await createOpportunity(a, { companyName: "Northwind Labs", roleTitle: "Designer" }));
      await upsertArtifacts(a, created.id, [{ key: "cv", kind: "cv", title: null, scope: "opportunity", stage: null, bodyMd: "# CV" }], { origin: "pushed" });
      expectFail(await markArtifactSent(b, created.id, "cv", 1), "not_found");
    } finally {
      await close();
    }
  });
});
