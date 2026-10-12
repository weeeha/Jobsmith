import { afterEach, describe, expect, it, vi } from "vitest";
import { DrizzleQueryError } from "drizzle-orm";
import type { Db } from "@/lib/db/client";
import { scoped } from "@/lib/db/scoped";
import type { PGlite } from "@electric-sql/pglite";
import { savePreferencesAction, testPostingAction } from "@/app/(app)/preferences/actions";
import { createFakeDriver } from "@/lib/ai/fake";
import type { AddJobDeps } from "@/lib/intake/deps";
import { NEEDS_TEXT_MESSAGES } from "@/lib/intake/messages";
import { parsePreferences } from "@/lib/preferences/schema";
import { UNREADABLE_INPUT_VALUE } from "@/lib/forms/submit";
import { DEFAULT_PREFERENCES } from "@/lib/preferences/schema";
import { loadProfile } from "@/lib/profile/store";
import { makeTestDb, createTestUser } from "../helpers/db";
import { fakeGuardedFetch } from "../helpers/intake";
import { seedProfile } from "../helpers/profile";

// Same harness as the other action tests: the signed-in user and path
// revalidation need a live Next.js request, so both are stubbed; scopedFor
// points at a real PGlite database through the real scoped().
const harness = vi.hoisted(() => ({
  db: undefined as Db | undefined,
  userId: "",
  deps: undefined as (() => AddJobDeps) | undefined,
  upsertError: undefined as unknown,
}));
const revalidatePathMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/auth/session", () => ({
  requireUser: async () => ({ id: harness.userId }),
}));

// The test box reads postings through the intake dependencies; each case
// decides what they are.
vi.mock("@/lib/intake/deps", () => ({ intakeDeps: () => harness.deps!() }));

vi.mock("next/cache", () => ({
  revalidatePath: revalidatePathMock,
}));

vi.mock("@/lib/db/scoped", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/db/scoped")>();
  return {
    ...actual,
    scopedFor: (userId: string) => {
      const real = actual.scoped(harness.db!, userId);
      if (!harness.upsertError) return real;
      return {
        ...real,
        profile: {
          ...real.profile,
          upsert: async () => {
            throw harness.upsertError;
          },
        },
      };
    },
  };
});

afterEach(() => {
  revalidatePathMock.mockClear();
  harness.upsertError = undefined;
  vi.restoreAllMocks();
});

function form(entries: [string, string][]): FormData {
  const formData = new FormData();
  for (const [name, value] of entries) formData.append(name, value);
  return formData;
}

async function setup(email: string) {
  const made = await makeTestDb();
  harness.db = made.db;
  harness.userId = (await createTestUser(made.db, email)).id;
  return { ...made, s: scoped(made.db, harness.userId) };
}

async function rowCounts(client: PGlite): Promise<Record<string, number>> {
  const tables = await client.query<{ table_name: string }>(
    `select table_name from information_schema.tables where table_schema = 'public' and table_type = 'BASE TABLE' order by 1`,
  );
  const counts: Record<string, number> = {};
  for (const { table_name } of tables.rows) {
    const rows = await client.query<{ n: number }>(`select count(*)::int as n from "${table_name}"`);
    counts[table_name] = rows.rows[0]!.n;
  }
  return counts;
}

describe("savePreferencesAction", () => {
  it("saves what the form posts, reads it back, and revalidates every page", async () => {
    const { s, close } = await setup("prefs-save@example.com");
    try {
      const state = await savePreferencesAction(
        undefined,
        form([
          ["titles", "Product Designer"],
          ["titles", "Design Lead"],
          ["titles", "product designer"],
          ["workModes", "remote"],
          ["workModes", "hybrid"],
          ["seniority", "senior"],
          ["locations", "Amsterdam"],
          ["compFloor", "100"],
          ["compTarget", "150"],
          ["currency", " eur "],
          ["mustHaves", "Design systems"],
          ["dealbreakers", "On-call rotation"],
          ["industriesAvoid", "Gambling"],
          ["companySize.min", "50"],
          ["companySize.max", "500"],
          ["scoreThreshold", "75"],
          ["attention.followUpDays", "10"],
          ["attention.savedDays", "5"],
        ]),
      );

      expect(state).toEqual({ ok: true });
      expect((await loadProfile(s)).preferences).toEqual({
        v: 1,
        // A repeated title keeps its first place and its later spelling.
        titles: ["product designer", "Design Lead"],
        seniority: ["senior"],
        locations: ["Amsterdam"],
        workModes: ["remote", "hybrid"],
        compFloor: 100,
        compTarget: 150,
        currency: "EUR",
        mustHaves: ["Design systems"],
        dealbreakers: ["On-call rotation"],
        industriesAvoid: ["Gambling"],
        companySize: { min: 50, max: 500 },
        scoreThreshold: 75,
        attention: { followUpDays: 10, savedDays: 5 },
      });
      expect(revalidatePathMock).toHaveBeenCalledWith("/", "layout");
    } finally {
      await close();
    }
  });

  it("restores the defaults for blank numbers and keeps the headline and resume", async () => {
    const { s, close } = await setup("prefs-blank@example.com");
    try {
      await seedProfile(s, { headline: "Product designer", preferences: { v: 1, compFloor: 100, scoreThreshold: 90 } });
      const state = await savePreferencesAction(
        undefined,
        form([
          ["compFloor", ""],
          ["scoreThreshold", ""],
          ["attention.followUpDays", ""],
          ["attention.savedDays", ""],
        ]),
      );

      expect(state).toEqual({ ok: true });
      const profile = await loadProfile(s);
      expect(profile.preferences).toEqual(DEFAULT_PREFERENCES);
      expect(profile.headline).toBe("Product designer");
      expect(profile.resumeMd).toContain("Northwind Traders");
    } finally {
      await close();
    }
  });

  it("keys nested errors by their dotted path and writes nothing", async () => {
    const { s, close } = await setup("prefs-errors@example.com");
    try {
      await seedProfile(s, { preferences: { v: 1, titles: ["Kept"] } });
      const state = await savePreferencesAction(
        undefined,
        form([
          ["companySize.min", "50"],
          ["companySize.max", "10"],
          ["attention.followUpDays", "90"],
          ["scoreThreshold", "101"],
          ["currency", "EURO"],
          ["titles", "x".repeat(81)],
        ]),
      );

      expect(state).toEqual({
        ok: false,
        code: "invalid",
        message: "Check the highlighted fields.",
        fieldErrors: {
          titles: "Keep each entry under 80 characters.",
          currency: "Enter a three-letter code such as EUR.",
          "companySize.max": "The smallest size must not be above the largest.",
          scoreThreshold: "Enter 0 to 100.",
          "attention.followUpDays": "Enter 1 to 60.",
        },
      });
      expect((await loadProfile(s)).preferences.titles).toEqual(["Kept"]);
      expect(revalidatePathMock).not.toHaveBeenCalled();
    } finally {
      await close();
    }
  });

  it("rejects the stand-in for a number box the browser could not read", async () => {
    const { close } = await setup("prefs-unreadable@example.com");
    try {
      const state = await savePreferencesAction(
        undefined,
        form([
          ["compFloor", UNREADABLE_INPUT_VALUE],
          ["companySize.min", UNREADABLE_INPUT_VALUE],
        ]),
      );
      expect(state).toMatchObject({
        ok: false,
        code: "invalid",
        fieldErrors: { compFloor: "Enter a number.", "companySize.min": "Enter a number." },
      });
    } finally {
      await close();
    }
  });

  it("rejects an unknown work mode instead of dropping it", async () => {
    const { close } = await setup("prefs-mode@example.com");
    try {
      const state = await savePreferencesAction(undefined, form([["workModes", "moon"]]));
      expect(state).toMatchObject({ ok: false, code: "invalid" });
    } finally {
      await close();
    }
  });

  it("returns server_error and logs no preference value when the write throws", async () => {
    const { close } = await setup("prefs-throws@example.com");
    try {
      const cause = Object.assign(new Error("timeout SECRET-PREF"), { code: "57014" });
      harness.upsertError = new DrizzleQueryError('update "profile" -- SECRET-PREF', ["SECRET-PREF"], cause);
      const errorLog = vi.spyOn(console, "error").mockImplementation(() => {});
      const infoLog = vi.spyOn(console, "info").mockImplementation(() => {});

      const state = await savePreferencesAction(undefined, form([["titles", "SECRET-PREF"], ["compFloor", "123456"]]));

      expect(state).toEqual({ ok: false, code: "server_error", message: "Something went wrong. Try again." });
      expect(revalidatePathMock).not.toHaveBeenCalled();
      expect(errorLog).toHaveBeenCalledTimes(1);
      expect(JSON.stringify([errorLog.mock.calls, infoLog.mock.calls])).not.toContain("SECRET");
      expect(JSON.stringify([errorLog.mock.calls, infoLog.mock.calls])).not.toContain("123456");
    } finally {
      await close();
    }
  });
});

describe("testPostingAction", () => {
  const NOW = new Date("2026-10-11T20:30:00.000Z");
  const POSTING = "Company: Northwind Traders\nRole: Product Designer\nFit score: 81\n\nAbout the job\nWe build internal tools.";

  function useFakeDeps(overrides: Partial<AddJobDeps> = {}) {
    harness.deps = () => ({ fetch: fakeGuardedFetch({}), ai: createFakeDriver(), now: () => NOW, requestId: "request-1", ...overrides });
  }

  afterEach(() => {
    harness.deps = undefined;
    vi.restoreAllMocks();
  });

  it("needs a link or text, and reports the same link error as Add job", async () => {
    const { close } = await setup("test-posting-invalid@example.com");
    try {
      useFakeDeps();
      expect(await testPostingAction(undefined, form([["postingText", "   "]]))).toEqual({
        ok: false,
        code: "invalid",
        message: "Check the highlighted fields.",
        fieldErrors: { postingText: "Paste a link or the posting text." },
      });
      expect(await testPostingAction(undefined, form([["sourceUrl", "ftp://example.com/job"]]))).toMatchObject({
        ok: false,
        code: "invalid",
        fieldErrors: { sourceUrl: "Enter a link that starts with http or https." },
      });
    } finally {
      await close();
    }
  });

  it("scores a pasted posting against the saved resume and preferences, and writes nothing", async () => {
    const { s, client, close } = await setup("test-posting-ok@example.com");
    try {
      await seedProfile(s, { preferences: parsePreferences({ titles: ["Product Designer"] }) });
      useFakeDeps();
      const before = await rowCounts(client);

      const state = await testPostingAction(undefined, form([["postingText", POSTING]]));

      expect(state).toMatchObject({
        ok: true,
        data: {
          roleTitle: "Product Designer",
          companyName: "Northwind Traders",
          fit: { score: 81 },
          note: null,
          hardFilters: { pass: true, failed: [], unchecked: [] },
        },
      });
      expect(await rowCounts(client)).toEqual(before);
      expect(revalidatePathMock).not.toHaveBeenCalled();
    } finally {
      await close();
    }
  });

  it("asks for the text when the link needs a login", async () => {
    const { close } = await setup("test-posting-link@example.com");
    try {
      useFakeDeps();
      expect(
        await testPostingAction(undefined, form([["sourceUrl", "https://www.linkedin.com/jobs/view/1000000001/"]])),
      ).toEqual({ ok: false, code: "needs_text", message: NEEDS_TEXT_MESSAGES.login_required });
    } finally {
      await close();
    }
  });

  it("returns server_error when a dependency throws, and logs no text", async () => {
    const { close } = await setup("test-posting-throw@example.com");
    try {
      const error = vi.spyOn(console, "error").mockImplementation(() => {});
      useFakeDeps({
        fetch: (async () => {
          throw new Error("SECRET-POSTING-TEXT");
        }) as AddJobDeps["fetch"],
      });
      const state = await testPostingAction(undefined, form([["sourceUrl", "https://example.com/jobs/1"]]));
      expect(state).toMatchObject({ ok: false, code: "server_error" });
      expect(JSON.stringify(error.mock.calls)).not.toContain("SECRET");
    } finally {
      await close();
    }
  });
});
