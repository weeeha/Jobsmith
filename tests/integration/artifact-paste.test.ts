import { describe, expect, it } from "vitest";
import { makeTestDb, createTestUser } from "../helpers/db";
import { scoped } from "@/lib/db/scoped";
import { createOpportunity } from "@/lib/pipeline/create";
import { pasteArtifact } from "@/lib/artifacts/paste";
import { expectOk, expectFail } from "../helpers/result";

async function setup(email: string) {
  const { db, close } = await makeTestDb();
  const user = await createTestUser(db, email);
  const s = scoped(db, user.id);
  const created = expectOk(await createOpportunity(s, { companyName: "Northwind Labs", roleTitle: "Designer" }));
  return { s, close, opportunityId: created.id };
}

describe("pasteArtifact", () => {
  it("a new paste creates version 1 with a derived key", async () => {
    const { s, close, opportunityId } = await setup("paste1@example.com");
    try {
      const result = expectOk(
        await pasteArtifact(s, opportunityId, { target: { mode: "new" }, title: "Cover Letter", kind: "cover_letter", stageId: null, bodyMd: "# Cover letter\nBody" }),
      );
      expect(result).toMatchObject({ key: "cover-letter", status: "created", version: 1, tab: "documents" });
    } finally {
      await close();
    }
  });

  it("two pastes titled CV get keys cv and cv-2", async () => {
    const { s, close, opportunityId } = await setup("paste2@example.com");
    try {
      const first = expectOk(
        await pasteArtifact(s, opportunityId, { target: { mode: "new" }, title: "CV", kind: "cv", stageId: null, bodyMd: "# CV\nFirst" }),
      );
      const second = expectOk(
        await pasteArtifact(s, opportunityId, { target: { mode: "new" }, title: "CV", kind: "cv", stageId: null, bodyMd: "# CV\nSecond, a different body" }),
      );
      expect([first.key, second.key]).toEqual(["cv", "cv-2"]);
    } finally {
      await close();
    }
  });

  it("pasting a new version onto an existing key versions it", async () => {
    const { s, close, opportunityId } = await setup("paste3@example.com");
    try {
      await pasteArtifact(s, opportunityId, { target: { mode: "new" }, title: "CV", kind: "cv", stageId: null, bodyMd: "# CV\nv1" });
      const versioned = expectOk(
        await pasteArtifact(s, opportunityId, { target: { mode: "version", scope: "opportunity", key: "cv" }, title: "CV", kind: "cv", stageId: null, bodyMd: "# CV\nv2" }),
      );
      expect(versioned).toMatchObject({ key: "cv", status: "versioned", version: 2 });
    } finally {
      await close();
    }
  });

  it("pasting the same content again onto an existing key is unchanged", async () => {
    const { s, close, opportunityId } = await setup("paste4@example.com");
    try {
      await pasteArtifact(s, opportunityId, { target: { mode: "new" }, title: "CV", kind: "cv", stageId: null, bodyMd: "# CV\nSame" });
      const again = expectOk(
        await pasteArtifact(s, opportunityId, { target: { mode: "version", scope: "opportunity", key: "cv" }, title: "CV", kind: "cv", stageId: null, bodyMd: "# CV\nSame" }),
      );
      expect(again.status).toBe("unchanged");
    } finally {
      await close();
    }
  });

  it("a new paste always lands in job scope, even for a company-wide kind", async () => {
    const { s, close, opportunityId } = await setup("paste5@example.com");
    try {
      const result = expectOk(
        await pasteArtifact(s, opportunityId, { target: { mode: "new" }, title: "Recon", kind: "research", stageId: null, bodyMd: "# Recon\nBody" }),
      );
      expect(result.scope).toBe("opportunity");
      const row = await s.artifact.getLatest({ opportunityId }, result.key);
      expect(row?.companyId).toBeNull();
    } finally {
      await close();
    }
  });

  it("rejects a blank or oversize body with invalid and writes nothing", async () => {
    const { s, close, opportunityId } = await setup("paste7@example.com");
    try {
      expectFail(
        await pasteArtifact(s, opportunityId, { target: { mode: "new" }, title: "CV", kind: "cv", stageId: null, bodyMd: "   " }),
        "invalid",
      );
      expectFail(
        await pasteArtifact(s, opportunityId, { target: { mode: "new" }, title: "CV", kind: "cv", stageId: null, bodyMd: "a".repeat(1_048_577) }),
        "invalid",
      );
      expect(await s.artifact.listKeys({ opportunityId })).toEqual([]);
    } finally {
      await close();
    }
  });

  it("a title with no ASCII letters still gets an editable, findable key", async () => {
    const { s, close, opportunityId } = await setup("paste8@example.com");
    try {
      const result = expectOk(
        await pasteArtifact(s, opportunityId, { target: { mode: "new" }, title: "Привет", kind: "cv", stageId: null, bodyMd: "# CV\nBody" }),
      );
      expect(result.key).toBe("document");
      const row = await s.artifact.getLatest({ opportunityId }, "document");
      expect(row).not.toBeNull();
    } finally {
      await close();
    }
  });

  it("returns artifact_not_found for a version-mode target whose key does not exist", async () => {
    const { s, close, opportunityId } = await setup("paste6@example.com");
    try {
      expectFail(
        await pasteArtifact(s, opportunityId, { target: { mode: "version", scope: "opportunity", key: "no-such-key" }, title: "X", kind: "cv", stageId: null, bodyMd: "# x" }),
        "artifact_not_found",
      );
    } finally {
      await close();
    }
  });

  it("returns not_found for user B on user A's job", async () => {
    const { db, close } = await makeTestDb();
    try {
      const alice = await createTestUser(db, "alice-paste@example.com");
      const bob = await createTestUser(db, "bob-paste@example.com");
      const a = scoped(db, alice.id);
      const b = scoped(db, bob.id);
      const created = expectOk(await createOpportunity(a, { companyName: "Northwind Labs", roleTitle: "Designer" }));
      expectFail(
        await pasteArtifact(b, created.id, { target: { mode: "new" }, title: "X", kind: "cv", stageId: null, bodyMd: "# x" }),
        "not_found",
      );
    } finally {
      await close();
    }
  });
});
