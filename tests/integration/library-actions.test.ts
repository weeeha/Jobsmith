import { afterEach, describe, expect, it, vi } from "vitest";
import type { Db } from "@/lib/db/client";
import { scoped, type Scoped } from "@/lib/db/scoped";
import { archiveLibraryItemAction, updateLibraryItemAction } from "@/app/(app)/library/actions";
import { createLibraryItem } from "@/lib/library/items";
import { makeTestDb, createTestUser } from "../helpers/db";
import { expectOk } from "../helpers/result";

// Same harness as prep-actions.test.ts.
const harness = vi.hoisted(() => ({ db: undefined as Db | undefined, userId: "" }));

vi.mock("@/lib/auth/session", () => ({
  requireUser: async () => ({ id: harness.userId }),
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

vi.mock("@/lib/db/scoped", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/db/scoped")>();
  return { ...actual, scopedFor: (userId: string) => actual.scoped(harness.db!, userId) };
});

afterEach(() => {
  vi.restoreAllMocks();
});

async function signIn(db: Db, email: string): Promise<Scoped> {
  harness.db = db;
  const user = await createTestUser(db, email);
  harness.userId = user.id;
  return scoped(db, user.id);
}

function form(fields: Record<string, string | string[]>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) {
    for (const v of Array.isArray(value) ? value : [value]) data.append(key, v);
  }
  return data;
}

async function storyFor(s: Scoped) {
  return expectOk(await createLibraryItem(s, { kind: "story", title: "Northwind pricing", bodyMd: "Old body", tags: [] }));
}

describe("library actions", () => {
  it("updateLibraryItemAction saves title, body and tags and returns field errors for an empty title", async () => {
    const { db, close } = await makeTestDb();
    try {
      const s = await signIn(db, "la1@example.com");
      const item = await storyFor(s);
      const saved = await updateLibraryItemAction(item.id, undefined, form({ title: " New title ", bodyMd: "New body", tags: ["a", "A", "b"] }));
      expect(saved).toEqual({ ok: true, data: { id: item.id } });
      expect(await s.libraryItem.getById(item.id)).toMatchObject({ kind: "story", title: "New title", bodyMd: "New body", tags: ["a", "b"] });

      const bad = await updateLibraryItemAction(item.id, undefined, form({ title: "  ", bodyMd: "x", tags: [] }));
      expect(bad).toMatchObject({ ok: false, code: "invalid", fieldErrors: { title: "Give the item a title." } });
      expect((await s.libraryItem.getById(item.id))?.title).toBe("New title");

      const tooMany = await updateLibraryItemAction(item.id, undefined, form({ title: "t", bodyMd: "x", tags: Array.from({ length: 21 }, (_, i) => `t${i}`) }));
      expect(tooMany).toMatchObject({ ok: false, fieldErrors: { tags: "Use at most 20 tags." } });

      const unknown = await updateLibraryItemAction(crypto.randomUUID(), undefined, form({ title: "t", bodyMd: "x" }));
      expect(unknown).toMatchObject({ ok: false, code: "not_found" });
      const malformed = await updateLibraryItemAction("not-an-id", undefined, form({ title: "t", bodyMd: "x" }));
      expect(malformed).toMatchObject({ ok: false, code: "not_found" });
    } finally {
      await close();
    }
  });

  it("archiveLibraryItemAction archives and unarchives and returns not_found for another user's item", async () => {
    const { db, close } = await makeTestDb();
    try {
      const owner = await signIn(db, "la2@example.com");
      const item = await storyFor(owner);
      const archived = expectOk(await archiveLibraryItemAction(item.id, true));
      expect(archived.archived).toBe(true);
      expect((await owner.libraryItem.getById(item.id))?.archivedAt).not.toBeNull();
      const restored = expectOk(await archiveLibraryItemAction(item.id, false));
      expect(restored.archived).toBe(false);
      expect((await owner.libraryItem.getById(item.id))?.archivedAt).toBeNull();

      await signIn(db, "la3@example.com");
      const foreign = await archiveLibraryItemAction(item.id, true);
      expect(foreign).toMatchObject({ ok: false, code: "not_found" });
      expect((await owner.libraryItem.getById(item.id))?.archivedAt).toBeNull();
      const foreignUpdate = await updateLibraryItemAction(item.id, undefined, form({ title: "Hijack", bodyMd: "x" }));
      expect(foreignUpdate).toMatchObject({ ok: false, code: "not_found" });
      expect((await owner.libraryItem.getById(item.id))?.title).toBe("Northwind pricing");
    } finally {
      await close();
    }
  });
});
