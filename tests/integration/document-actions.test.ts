import { describe, expect, it, vi } from "vitest";
import type { Db } from "@/lib/db/client";
import { scoped } from "@/lib/db/scoped";
import { createOpportunity } from "@/lib/pipeline/create";
import { upsertArtifacts } from "@/lib/artifacts/upsert";
import { saveDocumentEditAction, markDocumentSentAction } from "@/app/(app)/jobs/[slug]/document-actions";
import { makeTestDb, createTestUser } from "../helpers/db";

// Both actions take a version number as a plain argument rather than reading
// it from FormData, so nothing stops a tampered client call from sending one
// that is not a positive integer. The signed-in user and path revalidation
// need a live Next.js request, so both are stubbed; scopedFor is pointed at
// a real PGlite database through the real scoped(), the same harness
// job-actions.test.ts and board-actions.test.ts already use.
const harness = vi.hoisted(() => ({ db: undefined as Db | undefined, userId: "" }));

vi.mock("@/lib/auth/session", () => ({
  requireUser: async () => ({ id: harness.userId }),
}));

vi.mock("next/cache", () => ({
  revalidatePath: () => {},
}));

vi.mock("@/lib/db/scoped", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/db/scoped")>();
  return { ...actual, scopedFor: (userId: string) => actual.scoped(harness.db!, userId) };
});

async function jobWithACv(db: Db, email: string): Promise<{ opportunityId: string; key: string }> {
  harness.db = db;
  harness.userId = (await createTestUser(db, email)).id;
  const s = scoped(db, harness.userId);
  const created = await createOpportunity(s, { companyName: "Northwind Labs", roleTitle: "Designer" });
  if (!created.ok) throw new Error(created.message);
  await upsertArtifacts(
    s,
    created.data.id,
    [{ key: "cv", kind: "cv", title: "CV", scope: "opportunity", stage: null, bodyMd: "# CV\nOriginal" }],
    { origin: "pushed" },
  );
  return { opportunityId: created.data.id, key: "cv" };
}

function editForm(bodyMd: string): FormData {
  const formData = new FormData();
  formData.set("bodyMd", bodyMd);
  return formData;
}

describe("markDocumentSentAction", () => {
  it.each([0, -1, 1.5, Number.NaN])("rejects a version of %s before it reaches SQL", async (badVersion) => {
    const { db, close } = await makeTestDb();
    try {
      const { opportunityId, key } = await jobWithACv(db, `sent-${badVersion}@example.com`);
      const result = await markDocumentSentAction(opportunityId, key, badVersion);
      expect(result).toEqual({ ok: false, code: "artifact_not_found", message: "This document no longer exists." });
    } finally {
      await close();
    }
  });

  it("marks a valid version as sent", async () => {
    const { db, close } = await makeTestDb();
    try {
      const { opportunityId, key } = await jobWithACv(db, "sent-ok@example.com");
      const result = await markDocumentSentAction(opportunityId, key, 1);
      expect(result.ok).toBe(true);
    } finally {
      await close();
    }
  });
});

describe("saveDocumentEditAction", () => {
  it.each([0, -1, 1.5, Number.NaN])("rejects a base version of %s before saving", async (badVersion) => {
    const { db, close } = await makeTestDb();
    try {
      const { opportunityId, key } = await jobWithACv(db, `edit-${badVersion}@example.com`);
      const state = await saveDocumentEditAction(opportunityId, key, badVersion, undefined, editForm("# CV\nEdited"));
      expect(state).toEqual({ ok: false, code: "artifact_not_found", message: "This document no longer exists." });
    } finally {
      await close();
    }
  });

  it("edits in place when the base version is still the latest", async () => {
    const { db, close } = await makeTestDb();
    try {
      const { opportunityId, key } = await jobWithACv(db, "edit-ok@example.com");
      const state = await saveDocumentEditAction(opportunityId, key, 1, undefined, editForm("# CV\nEdited"));
      expect(state).toMatchObject({ ok: true, data: { status: "edited", version: 1 } });
    } finally {
      await close();
    }
  });

  it("forks a new version instead of overwriting a push the editor never saw", async () => {
    const { db, close } = await makeTestDb();
    try {
      const { opportunityId, key } = await jobWithACv(db, "edit-stale@example.com");
      const s = scoped(db, harness.userId);
      await upsertArtifacts(s, opportunityId, [{ key, kind: "cv", title: "CV", scope: "opportunity", stage: null, bodyMd: "# CV\nPushed while open" }], {
        origin: "pushed",
      });
      // The action still believes version 1 (what it rendered) is the latest.
      const state = await saveDocumentEditAction(opportunityId, key, 1, undefined, editForm("# CV\nEdited from the stale draft"));
      expect(state).toMatchObject({ ok: true, data: { status: "versioned", version: 3 } });
    } finally {
      await close();
    }
  });
});
