import { describe, expect, it, vi } from "vitest";
import { makeTestDb, createTestUser } from "../helpers/db";
import { scoped, type Scoped } from "@/lib/db/scoped";
import { createOpportunity } from "@/lib/pipeline/create";
import { upsertArtifacts } from "@/lib/artifacts/upsert";
import { saveArtifactEdit } from "@/lib/artifacts/edit";
import { loadComparison } from "@/lib/compare/load";
import { expectFail, expectOk } from "../helpers/result";

async function setup(email: string) {
  const { db, close } = await makeTestDb();
  const user = await createTestUser(db, email);
  const s = scoped(db, user.id);
  const created = expectOk(await createOpportunity(s, { companyName: "Northwind Labs", roleTitle: "Designer" }));
  const scope = { opportunityId: created.id };
  const push = (bodyMd: string, now?: Date) =>
    upsertArtifacts(s, created.id, [{ key: "cl", kind: "cover_letter", title: "Letter", scope: "opportunity", stage: null, bodyMd }], { origin: "pushed", now });
  return { db, s, close, scope, push, opportunityId: created.id, user };
}

describe("loadComparison", () => {
  it("unknown key, unknown version and another user's scope return not_found", async () => {
    const { db, s, close, scope, push } = await setup("cmp1@example.com");
    try {
      await push("# L\nv1");
      await push("# L\nv2");
      expectFail(await loadComparison(s, scope, "nope", { a: null, b: null }), "not_found");
      expectFail(await loadComparison(s, scope, "cl", { a: 1, b: 9 }), "not_found");
      const other = await createTestUser(db, "cmp1-other@example.com");
      expectFail(await loadComparison(scoped(db, other.id), scope, "cl", { a: null, b: null }), "not_found");
    } finally {
      await close();
    }
  });

  it("a single version has no pair and returns not_found", async () => {
    const { s, close, scope, push } = await setup("cmp2@example.com");
    try {
      await push("# L\nv1");
      expectFail(await loadComparison(s, scope, "cl", { a: null, b: null }), "not_found");
    } finally {
      await close();
    }
  });

  it("a and b both null use the default pair; a equal to b is mode same with no diff", async () => {
    const { s, close, scope, push } = await setup("cmp3@example.com");
    try {
      await push("# L\nHello there.");
      await push("# L\nHello world.");
      const c = expectOk(await loadComparison(s, scope, "cl", { a: null, b: null }));
      expect([c.a.version, c.b.version, c.mode]).toEqual([1, 2, "diff"]);
      expect(c.diff?.changeCount).toBe(1);
      expect(c.title).toBe("Letter");
      expect(c.versions).toHaveLength(2);
      const same = expectOk(await loadComparison(s, scope, "cl", { a: 2, b: 2 }));
      expect(same.mode).toBe("same");
      expect(same.diff).toBeNull();
    } finally {
      await close();
    }
  });

  it("mode too_different carries both bodies and diff null", async () => {
    const { s, close, scope, push } = await setup("cmp4@example.com");
    try {
      const lines = (p: string) => Array.from({ length: 6000 }, (_, i) => `${p}${i}`).join("\n");
      await push(lines("a"));
      await push(lines("b"));
      const c = expectOk(await loadComparison(s, scope, "cl", { a: 1, b: 2 }));
      expect(c.mode).toBe("too_different");
      expect(c.diff).toBeNull();
      expect(c.a.bodyMd.startsWith("a0")).toBe(true);
      expect(c.b.bodyMd.startsWith("b0")).toBe(true);
    } finally {
      await close();
    }
  });

  it("notice.baseVersion is set when b is pushed on top of an edited version, null otherwise", async () => {
    const { s, close, scope, push, opportunityId } = await setup("cmp5@example.com");
    try {
      await push("# L\nv1");
      expectOk(await saveArtifactEdit(s, opportunityId, { scope: "opportunity", key: "cl" }, "# L\nv1 edited", 1, new Date("2026-01-02T00:00:00Z")));
      await push("# L\nv2 pushed");
      const c = expectOk(await loadComparison(s, scope, "cl", { a: null, b: null }));
      expect(c.notice).toEqual({ baseVersion: 1 });
      await push("# L\nv3 pushed");
      const d = expectOk(await loadComparison(s, scope, "cl", { a: 2, b: 3 }));
      expect(d.notice).toBeNull();
    } finally {
      await close();
    }
  });

  it("reads bodies with exactly two getVersion calls and one listVersions", async () => {
    const { s, close, scope, push } = await setup("cmp6@example.com");
    try {
      await push("# L\nv1");
      await push("# L\nv2");
      const getVersion = vi.spyOn(s.artifact, "getVersion");
      const listVersions = vi.spyOn(s.artifact, "listVersions");
      expectOk(await loadComparison(s as Scoped, scope, "cl", { a: 1, b: 2 }));
      expect(getVersion).toHaveBeenCalledTimes(2);
      expect(listVersions).toHaveBeenCalledTimes(1);
    } finally {
      await close();
    }
  });

  it("lines appended at the end leave the old last line unchanged", async () => {
    const { s, close, scope, push } = await setup("cmp7@example.com");
    try {
      await push("# L\nlast line");
      await push("# L\nlast line\nnew line");
      const c = expectOk(await loadComparison(s, scope, "cl", { a: 1, b: 2 }));
      const changes = c.diff!.rows.filter((r) => r.type === "change");
      expect(changes).toHaveLength(1);
      if (changes[0].type === "change") {
        expect(changes[0].removed).toEqual([]);
        expect(changes[0].added.join("")).toBe("new line\n");
      }
    } finally {
      await close();
    }
  });
});
