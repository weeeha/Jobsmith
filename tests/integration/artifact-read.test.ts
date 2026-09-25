import { describe, expect, it } from "vitest";
import { makeTestDb, createTestUser } from "../helpers/db";
import { scoped } from "@/lib/db/scoped";
import { createOpportunity } from "@/lib/pipeline/create";
import { upsertArtifacts } from "@/lib/artifacts/upsert";
import { getDocument } from "@/lib/artifacts/read";
import { expectOk } from "../helpers/result";

describe("getDocument", () => {
  it("returns the latest version, every version, and the latest version number", async () => {
    const { db, close } = await makeTestDb();
    try {
      const user = await createTestUser(db, "read1@example.com");
      const s = scoped(db, user.id);
      const created = expectOk(await createOpportunity(s, { companyName: "Northwind Labs", roleTitle: "Designer" }));
      await upsertArtifacts(s, created.id, [{ key: "cv", kind: "cv", title: null, scope: "opportunity", stage: null, bodyMd: "# CV\nv1" }], { origin: "pushed" });
      await upsertArtifacts(s, created.id, [{ key: "cv", kind: "cv", title: null, scope: "opportunity", stage: null, bodyMd: "# CV\nv2" }], { origin: "pushed" });

      const view = await getDocument(s, { opportunityId: created.id, companyId: "unused" }, { scope: "opportunity", key: "cv" });
      expect(view?.current.bodyMd).toBe("# CV\nv2");
      expect(view?.versions).toHaveLength(2);
      expect(view?.latestVersion).toBe(2);
    } finally {
      await close();
    }
  });

  it("returns a specific older version when asked, but latestVersion still names the newest", async () => {
    const { db, close } = await makeTestDb();
    try {
      const user = await createTestUser(db, "read2@example.com");
      const s = scoped(db, user.id);
      const created = expectOk(await createOpportunity(s, { companyName: "Northwind Labs", roleTitle: "Designer" }));
      await upsertArtifacts(s, created.id, [{ key: "cv", kind: "cv", title: null, scope: "opportunity", stage: null, bodyMd: "# CV\nv1" }], { origin: "pushed" });
      await upsertArtifacts(s, created.id, [{ key: "cv", kind: "cv", title: null, scope: "opportunity", stage: null, bodyMd: "# CV\nv2" }], { origin: "pushed" });

      const view = await getDocument(s, { opportunityId: created.id, companyId: "unused" }, { scope: "opportunity", key: "cv" }, 1);
      expect(view?.current.bodyMd).toBe("# CV\nv1");
      expect(view?.latestVersion).toBe(2);
    } finally {
      await close();
    }
  });

  it("falls back to the latest version when an unknown version number is given", async () => {
    const { db, close } = await makeTestDb();
    try {
      const user = await createTestUser(db, "read3@example.com");
      const s = scoped(db, user.id);
      const created = expectOk(await createOpportunity(s, { companyName: "Northwind Labs", roleTitle: "Designer" }));
      await upsertArtifacts(s, created.id, [{ key: "cv", kind: "cv", title: null, scope: "opportunity", stage: null, bodyMd: "# CV\nv1" }], { origin: "pushed" });

      const view = await getDocument(s, { opportunityId: created.id, companyId: "unused" }, { scope: "opportunity", key: "cv" }, 99);
      expect(view?.current.bodyMd).toBe("# CV\nv1");
    } finally {
      await close();
    }
  });

  it("returns null for a key that does not exist", async () => {
    const { db, close } = await makeTestDb();
    try {
      const user = await createTestUser(db, "read4@example.com");
      const s = scoped(db, user.id);
      const created = expectOk(await createOpportunity(s, { companyName: "Northwind Labs", roleTitle: "Designer" }));
      expect(await getDocument(s, { opportunityId: created.id, companyId: "unused" }, { scope: "opportunity", key: "no-such-key" })).toBeNull();
    } finally {
      await close();
    }
  });
});
