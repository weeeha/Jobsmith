import { afterEach, describe, expect, it, vi } from "vitest";
import type { Db } from "@/lib/db/client";
import * as schema from "@/lib/db/schema";
import type { AiDriver } from "@/lib/ai/driver";
import { createFakeDriver } from "@/lib/ai/fake";
import { testPostingAction } from "@/app/(app)/preferences/actions";
import { scoped } from "@/lib/db/scoped";
import { parsePreferences } from "@/lib/preferences/schema";
import { makeTestDb, createTestUser } from "../helpers/db";
import { fakeGuardedFetch } from "../helpers/intake";
import { seedProfile } from "../helpers/profile";

// Same harness as board-actions.test.ts: the signed-in user needs a live
// Next.js request, so it is stubbed; scopedFor is pointed at a real PGlite
// database; intakeDeps gets a fake fetch and the driver the test chooses.
const harness = vi.hoisted(() => ({ db: undefined as Db | undefined, userId: "", ai: null as AiDriver | null }));

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

vi.mock("@/lib/intake/deps", () => ({
  intakeDeps: () => ({ fetch: fakeGuardedFetch({}), ai: harness.ai, now: () => new Date("2026-10-15T09:00:00.000Z"), requestId: "test" }),
}));

afterEach(() => {
  harness.ai = null;
  vi.restoreAllMocks();
});

const LINKEDIN = "https://www.linkedin.com/jobs/view/1000000001/";
const POSTING = ["Company: Northwind Labs", "Role: Design Lead", "Location: Berlin, Germany", "Fit score: 64", "", "About the job"].join("\n");

function form(values: Record<string, string>): FormData {
  const formData = new FormData();
  for (const [name, value] of Object.entries(values)) formData.set(name, value);
  return formData;
}

async function signIn(db: Db) {
  harness.db = db;
  harness.userId = (await createTestUser(db, "tester@example.com")).id;
  return scoped(db, harness.userId);
}

describe("testPostingAction", () => {
  it("asks for a link when the box is empty", async () => {
    const { db, close } = await makeTestDb();
    try {
      await signIn(db);
      expect(await testPostingAction(undefined, form({ sourceUrl: "  " }))).toEqual({
        ok: false,
        code: "invalid",
        message: "Check the highlighted fields.",
        fieldErrors: { sourceUrl: "Paste a link to a posting." },
      });
    } finally {
      await close();
    }
  });

  it("asks for the posting text when the link cannot be read", async () => {
    const { db, close } = await makeTestDb();
    try {
      await signIn(db);
      expect(await testPostingAction(undefined, form({ sourceUrl: LINKEDIN }))).toEqual({
        ok: false,
        code: "needs_text",
        message: "This site needs a login, so Jobsmith cannot read the link. Paste the posting text instead.",
        fieldErrors: { postingText: "Paste the posting here." },
      });
    } finally {
      await close();
    }
  });

  it("checks and scores the pasted text against the saved preferences, and adds nothing", async () => {
    const { db, close } = await makeTestDb();
    try {
      const s = await signIn(db);
      await seedProfile(s, { preferences: parsePreferences({ locations: ["Rotterdam"] }) });
      harness.ai = createFakeDriver();
      vi.spyOn(console, "info").mockImplementation(() => {});

      const state = await testPostingAction(undefined, form({ sourceUrl: LINKEDIN, postingText: POSTING }));

      expect(state).toMatchObject({ ok: true, result: { roleTitle: "Design Lead", note: null, fit: { score: 64 } } });
      if (!state?.ok) throw new Error("expected a result");
      expect(state.result.hardFilters.failed).toEqual(["location"]);
      expect(await db.select().from(schema.opportunity)).toHaveLength(0);
      expect(await db.select().from(schema.company)).toHaveLength(0);
    } finally {
      await close();
    }
  });

  it("turns an unexpected error into a message and logs only its name", async () => {
    const { db, close } = await makeTestDb();
    try {
      const s = await signIn(db);
      await seedProfile(s);
      harness.ai = {
        name: "fake",
        modelId: "fake-extractor",
        generate: async () => {
          throw new Error("SECRET-POSTING-TEXT");
        },
      };
      const error = vi.spyOn(console, "error").mockImplementation(() => {});

      expect(await testPostingAction(undefined, form({ sourceUrl: LINKEDIN, postingText: POSTING }))).toEqual({
        ok: false,
        code: "server_error",
        message: "Something went wrong. Try again.",
      });
      expect(JSON.stringify(error.mock.calls)).not.toContain("SECRET");
    } finally {
      await close();
    }
  });
});
