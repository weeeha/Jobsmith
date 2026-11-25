import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { makeTestDb, createTestUser } from "../helpers/db";
import { scoped } from "@/lib/db/scoped";
import {
  archiveLibraryItem,
  createLibraryItem,
  getLibraryItem,
  listLibrary,
  updateLibraryItem,
} from "@/lib/library/items";
import { expectFail, expectOk } from "../helpers/result";

async function setup() {
  const { db, close } = await makeTestDb();
  const a = await createTestUser(db, "a@example.com");
  const b = await createTestUser(db, "b@example.com");
  return { db, close, a: scoped(db, a.id), b: scoped(db, b.id) };
}

const story = { kind: "story" as const, title: "Northwind pricing page", bodyMd: "We cut the steps from five to three.", tags: ["pricing", "Research"] };

describe("library items", () => {
  it("createLibraryItem stores a story with tags and no question key", async () => {
    const { a, close } = await setup();
    try {
      const item = expectOk(await createLibraryItem(a, story));
      expect(item).toMatchObject({ kind: "story", title: story.title, tags: ["pricing", "Research"], questionKey: null, sourceOpportunityId: null, sourceArtifactId: null, archivedAt: null });
      expect(await getLibraryItem(a, item.id)).toEqual(item);
      expectFail(await createLibraryItem(a, { ...story, title: " " }), "invalid");
    } finally {
      await close();
    }
  });

  it("updateLibraryItem changes title, body and tags and keeps the source fields", async () => {
    const { a, close } = await setup();
    try {
      const row = await a.libraryItem.insert({
        kind: "answer",
        title: "Why Northwind",
        bodyMd: "Old",
        tags: [],
        questionKey: "0123456789abcdef",
      });
      const updated = expectOk(
        await updateLibraryItem(a, row.id, { kind: "answer", title: " New title ", bodyMd: "New body", tags: ["a", "A", "b"] }),
      );
      expect(updated).toMatchObject({ title: "New title", bodyMd: "New body", tags: ["a", "b"], questionKey: "0123456789abcdef" });
      expectFail(await updateLibraryItem(a, row.id, { kind: "answer", title: "", bodyMd: "x", tags: [] }), "invalid");
    } finally {
      await close();
    }
  });

  it("archive sets archived_at and unarchive clears it", async () => {
    const { a, close } = await setup();
    try {
      const item = expectOk(await createLibraryItem(a, story));
      const when = new Date("2026-11-20T10:00:00Z");
      const archived = expectOk(await archiveLibraryItem(a, item.id, true, when));
      expect(archived.archivedAt).toEqual(when);
      const back = expectOk(await archiveLibraryItem(a, item.id, false));
      expect(back.archivedAt).toBeNull();
    } finally {
      await close();
    }
  });

  it("listLibrary hides archived items unless asked, searches title, body and tags case-insensitively, and filters by kind and by tag", async () => {
    const { a, close } = await setup();
    try {
      const one = expectOk(await createLibraryItem(a, story));
      const two = expectOk(await createLibraryItem(a, { kind: "fact", title: "Team size", bodyMd: "Eight designers across Pricing and Billing", tags: ["team"] }));
      const three = expectOk(await createLibraryItem(a, { kind: "intro", title: "Short intro", bodyMd: "Hello there", tags: ["pricing"] }));
      expectOk(await archiveLibraryItem(a, three.id, true));

      expect((await listLibrary(a, {})).map((r) => r.id).sort()).toEqual([one.id, two.id].sort());
      expect((await listLibrary(a, { includeArchived: true })).map((r) => r.id).sort()).toEqual([one.id, two.id, three.id].sort());
      // title, body and tags
      expect((await listLibrary(a, { q: "NORTHWIND" })).map((r) => r.id)).toEqual([one.id]);
      expect((await listLibrary(a, { q: "billing" })).map((r) => r.id)).toEqual([two.id]);
      expect((await listLibrary(a, { q: "research" })).map((r) => r.id)).toEqual([one.id]);
      expect((await listLibrary(a, { kind: "fact" })).map((r) => r.id)).toEqual([two.id]);
      expect((await listLibrary(a, { tag: "PRICING" })).map((r) => r.id)).toEqual([one.id]);
      expect((await listLibrary(a, { tag: "pricing", includeArchived: true })).map((r) => r.id).sort()).toEqual([one.id, three.id].sort());
      expect(await listLibrary(a, { q: "   " })).toHaveLength(2);
      expect((await listLibrary(a, {}))[0].firstLine).toBeTruthy();
    } finally {
      await close();
    }
  });

  it("listLibrary returns newest updated first", async () => {
    const { a, close } = await setup();
    try {
      const first = expectOk(await createLibraryItem(a, { ...story, title: "First" }));
      const second = expectOk(await createLibraryItem(a, { ...story, title: "Second" }));
      await new Promise((r) => setTimeout(r, 15));
      expectOk(await updateLibraryItem(a, first.id, { kind: "story", title: "First edited", bodyMd: "x", tags: [] }));
      expect((await listLibrary(a, {})).map((r) => r.id)).toEqual([first.id, second.id]);
    } finally {
      await close();
    }
  });

  it("another user's item is not_found for update and archive and absent from the list", async () => {
    const { a, b, close } = await setup();
    try {
      const item = expectOk(await createLibraryItem(a, story));
      expectFail(await updateLibraryItem(b, item.id, { kind: "story", title: "Mine now", bodyMd: "x", tags: [] }), "not_found");
      expectFail(await archiveLibraryItem(b, item.id, true), "not_found");
      expect(await getLibraryItem(b, item.id)).toBeNull();
      expect(await listLibrary(b, { includeArchived: true })).toEqual([]);
      expect((await getLibraryItem(a, item.id))?.archivedAt).toBeNull();
    } finally {
      await close();
    }
  });

  it("is the only writer of library_item rows in lib and app", () => {
    const root = path.resolve(__dirname, "../..");
    const hits: string[] = [];
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const full = path.join(dir, name);
        if (statSync(full).isDirectory()) walk(full);
        else if (/\.(ts|tsx)$/.test(name) && /\blibraryItem\.(insert|update)\(/.test(readFileSync(full, "utf8"))) {
          hits.push(path.relative(root, full));
        }
      }
    };
    walk(path.join(root, "lib"));
    walk(path.join(root, "app"));
    expect(hits.sort()).toEqual(["lib/library/items.ts"]);
  });
});
