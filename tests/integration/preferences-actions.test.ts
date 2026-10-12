import { afterEach, describe, expect, it, vi } from "vitest";
import type { Db } from "@/lib/db/client";
import { scoped } from "@/lib/db/scoped";
import { savePreferencesAction } from "@/app/(app)/preferences/actions";
import { UNREADABLE_INPUT_VALUE } from "@/lib/forms/submit";
import { DEFAULT_PREFERENCES } from "@/lib/preferences/schema";
import { loadProfile } from "@/lib/profile/store";
import { makeTestDb, createTestUser } from "../helpers/db";
import { seedProfile } from "../helpers/profile";

// Same harness as the other action tests: the signed-in user and path
// revalidation need a live Next.js request, so both are stubbed; scopedFor
// points at a real PGlite database through the real scoped().
const harness = vi.hoisted(() => ({ db: undefined as Db | undefined, userId: "" }));
const revalidatePathMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/auth/session", () => ({
  requireUser: async () => ({ id: harness.userId }),
}));

vi.mock("next/cache", () => ({
  revalidatePath: revalidatePathMock,
}));

vi.mock("@/lib/db/scoped", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/db/scoped")>();
  return { ...actual, scopedFor: (userId: string) => actual.scoped(harness.db!, userId) };
});

afterEach(() => {
  revalidatePathMock.mockClear();
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
});
