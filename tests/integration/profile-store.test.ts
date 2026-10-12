import { describe, expect, it } from "vitest";
import { makeTestDb, createTestUser } from "../helpers/db";
import { scoped } from "@/lib/db/scoped";
import { DEFAULT_PREFERENCES, parsePreferences } from "@/lib/preferences/schema";
import { loadProfile, savePreferences, saveProfile } from "@/lib/profile/store";

async function setup() {
  const { db, close } = await makeTestDb();
  const user = await createTestUser(db, "owner@example.com");
  return { db, close, s: scoped(db, user.id) };
}

describe("loadProfile", () => {
  it("gives defaults when the user has no profile row", async () => {
    const { s, close } = await setup();
    try {
      expect(await loadProfile(s)).toEqual({
        headline: null,
        resumeMd: null,
        timezone: "UTC",
        preferences: DEFAULT_PREFERENCES,
        updatedAt: null,
      });
    } finally {
      await close();
    }
  });

  it("gives defaults for a fresh row (preferences {})", async () => {
    const { s, close } = await setup();
    try {
      await s.profile.upsert({});
      const profile = await loadProfile(s);
      expect(profile.preferences).toEqual(DEFAULT_PREFERENCES);
      expect(profile.timezone).toBe("UTC");
      expect(profile.updatedAt).toBeInstanceOf(Date);
    } finally {
      await close();
    }
  });

  it("lets bad stored preferences fall back field by field", async () => {
    const { s, close } = await setup();
    try {
      await s.profile.upsert({ preferences: { titles: ["Product Designer"], scoreThreshold: "high" } });
      const { preferences } = await loadProfile(s);
      expect(preferences.titles).toEqual(["Product Designer"]);
      expect(preferences.scoreThreshold).toBe(70);
    } finally {
      await close();
    }
  });

  it("falls back to UTC for a stored zone that is not a zone, and canonicalizes one that is", async () => {
    const { s, close } = await setup();
    try {
      await s.profile.upsert({ timezone: "Mars/Olympus" });
      expect((await loadProfile(s)).timezone).toBe("UTC");
      await s.profile.upsert({ timezone: "Etc/UTC" });
      expect((await loadProfile(s)).timezone).toBe("UTC");
    } finally {
      await close();
    }
  });
});

describe("saveProfile and savePreferences", () => {
  it("saves the profile and loads it back", async () => {
    const { s, close } = await setup();
    try {
      await saveProfile(s, { headline: "Product designer", resumeMd: "# Resume", timezone: "Europe/Amsterdam" });
      expect(await loadProfile(s)).toMatchObject({ headline: "Product designer", resumeMd: "# Resume", timezone: "Europe/Amsterdam" });
      await saveProfile(s, { headline: null, resumeMd: null, timezone: "UTC" });
      expect(await loadProfile(s)).toMatchObject({ headline: null, resumeMd: null, timezone: "UTC" });
    } finally {
      await close();
    }
  });

  it("saves preferences and keeps the headline, resume and zone", async () => {
    const { s, close } = await setup();
    try {
      await saveProfile(s, { headline: "Product designer", resumeMd: "# Resume", timezone: "Asia/Tokyo" });
      const preferences = parsePreferences({ titles: ["Product Designer"], workModes: ["remote"], compFloor: 100 });
      await savePreferences(s, preferences);
      expect(await loadProfile(s)).toMatchObject({
        headline: "Product designer",
        resumeMd: "# Resume",
        timezone: "Asia/Tokyo",
        preferences,
      });
    } finally {
      await close();
    }
  });

  it("saves the profile and keeps the preferences", async () => {
    const { s, close } = await setup();
    try {
      const preferences = parsePreferences({ locations: ["Rotterdam"] });
      await savePreferences(s, preferences);
      await saveProfile(s, { headline: "Designer", resumeMd: null, timezone: "UTC" });
      expect((await loadProfile(s)).preferences).toEqual(preferences);
    } finally {
      await close();
    }
  });

  it("moves updatedAt forward on every save", async () => {
    const { s, close } = await setup();
    try {
      await saveProfile(s, { headline: null, resumeMd: null, timezone: "UTC" });
      const first = (await loadProfile(s)).updatedAt!;
      await new Promise((resolve) => setTimeout(resolve, 5));
      await savePreferences(s, DEFAULT_PREFERENCES);
      expect((await loadProfile(s)).updatedAt!.getTime()).toBeGreaterThan(first.getTime());
    } finally {
      await close();
    }
  });
});
