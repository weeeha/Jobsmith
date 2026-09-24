import { describe, expect, it } from "vitest";
import { makeTestDb, createTestUser } from "../helpers/db";
import { scoped } from "@/lib/db/scoped";
import { createOpportunity } from "@/lib/pipeline/create";
import { upsertArtifacts } from "@/lib/artifacts/upsert";
import { saveArtifactEdit } from "@/lib/artifacts/edit";
import { expectOk, expectFail } from "../helpers/result";

// markArtifactSent is imported dynamically inside the one test that needs
// it, same reason as artifact-upsert.test.ts above: a missing dynamic import
// target fails only that test, not the whole file at load time.

async function setup(email: string) {
  const { db, close } = await makeTestDb();
  const user = await createTestUser(db, email);
  const s = scoped(db, user.id);
  const created = expectOk(await createOpportunity(s, { companyName: "Northwind Labs", roleTitle: "Designer" }));
  await upsertArtifacts(
    s,
    created.id,
    [{ key: "cv", kind: "cv", title: "Kept title", scope: "opportunity", stage: null, bodyMd: "# CV\nOriginal" }],
    { origin: "pushed", now: new Date("2026-01-01T00:00:00Z") },
  );
  return { s, close, opportunityId: created.id };
}

describe("saveArtifactEdit", () => {
  it("edits the latest version in place when it is not sent", async () => {
    const { s, close, opportunityId } = await setup("edit1@example.com");
    try {
      const result = expectOk(
        await saveArtifactEdit(s, opportunityId, { scope: "opportunity", key: "cv" }, "# CV\nEdited", new Date("2026-01-02T00:00:00Z")),
      );
      expect(result).toEqual({ status: "edited", version: 1, title: "Kept title" });
      const versions = await s.artifact.listVersions({ opportunityId }, "cv");
      expect(versions).toHaveLength(1);
    } finally {
      await close();
    }
  });

  it("versions instead of editing in place once the latest is sent, and keeps its own metadata", async () => {
    const { s, close, opportunityId } = await setup("edit2@example.com");
    try {
      const { markArtifactSent } = await import("@/lib/artifacts/sent");
      await markArtifactSent(s, opportunityId, "cv", 1, new Date("2026-01-02T00:00:00Z"));
      const result = expectOk(
        await saveArtifactEdit(s, opportunityId, { scope: "opportunity", key: "cv" }, "# CV\nEdited after sent", new Date("2026-01-03T00:00:00Z")),
      );
      expect(result).toEqual({ status: "versioned", version: 2, title: "Kept title" });
      const v2 = await s.artifact.getVersion({ opportunityId }, "cv", 2);
      expect(v2?.title).toBe("Kept title");
      expect(v2?.sentAt).toBeNull();
    } finally {
      await close();
    }
  });

  it("an unchanged body is unchanged and writes nothing", async () => {
    const { s, close, opportunityId } = await setup("edit3@example.com");
    try {
      const before = await s.artifact.getLatest({ opportunityId }, "cv");
      const result = expectOk(await saveArtifactEdit(s, opportunityId, { scope: "opportunity", key: "cv" }, "# CV\nOriginal", new Date("2026-01-02T00:00:00Z")));
      expect(result.status).toBe("unchanged");
      const after = await s.artifact.getLatest({ opportunityId }, "cv");
      expect(after?.updatedAt.toISOString()).toBe(before?.updatedAt.toISOString());
    } finally {
      await close();
    }
  });

  it("rejects a blank or oversize body with invalid", async () => {
    const { s, close, opportunityId } = await setup("edit4@example.com");
    try {
      expectFail(await saveArtifactEdit(s, opportunityId, { scope: "opportunity", key: "cv" }, "   "), "invalid");
      expectFail(await saveArtifactEdit(s, opportunityId, { scope: "opportunity", key: "cv" }, "a".repeat(1_048_577)), "invalid");
    } finally {
      await close();
    }
  });

  it("returns artifact_not_found for a key that does not exist", async () => {
    const { s, close, opportunityId } = await setup("edit5@example.com");
    try {
      expectFail(await saveArtifactEdit(s, opportunityId, { scope: "opportunity", key: "no-such-key" }, "# x"), "artifact_not_found");
    } finally {
      await close();
    }
  });

  it("returns not_found for user B on user A's job", async () => {
    const { db, close } = await makeTestDb();
    try {
      const alice = await createTestUser(db, "alice-edit@example.com");
      const bob = await createTestUser(db, "bob-edit@example.com");
      const a = scoped(db, alice.id);
      const b = scoped(db, bob.id);
      const created = expectOk(await createOpportunity(a, { companyName: "Northwind Labs", roleTitle: "Designer" }));
      await upsertArtifacts(a, created.id, [{ key: "cv", kind: "cv", title: null, scope: "opportunity", stage: null, bodyMd: "# CV" }], { origin: "pushed" });
      expectFail(await saveArtifactEdit(b, created.id, { scope: "opportunity", key: "cv" }, "# x"), "not_found");
    } finally {
      await close();
    }
  });
});
