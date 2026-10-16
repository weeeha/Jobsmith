import { describe, expect, it } from "vitest";
import { makeTestDb, createTestUser } from "../helpers/db";
import { scoped } from "@/lib/db/scoped";
import { getProfile, profileInputSchema, saveProfile } from "@/lib/profile";
import { preferencesInputSchema } from "@/lib/preferences/schema";
import { getPreferences, savePreferences } from "@/lib/preferences/save";
import { expectOk } from "../helpers/result";

describe("profile store", () => {
  it("reads UTC and empty fields before anything is saved", async () => {
    const { db, close } = await makeTestDb();
    try {
      const user = await createTestUser(db, "profile-empty@example.com");
      expect(await getProfile(scoped(db, user.id))).toEqual({ headline: null, timezone: "UTC", resumeMd: null });
    } finally {
      await close();
    }
  });

  it("saves and clears, and leaves preferences alone", async () => {
    const { db, close } = await makeTestDb();
    try {
      const user = await createTestUser(db, "profile-owner@example.com");
      const s = scoped(db, user.id);
      const prefs = expectOk(
        await savePreferences(
          s,
          preferencesInputSchema.parse({
            titles: ["Design lead"], seniority: [], locations: [], workModes: [], compFloor: null, compTarget: null,
            currency: "USD", mustHaves: [], dealbreakers: [], industriesAvoid: [], sizeMin: null, sizeMax: null,
            scoreThreshold: 70, followUpDays: 7, savedDays: 3,
          }),
        ),
      );
      expectOk(await saveProfile(s, profileInputSchema.parse({ headline: "Designer", timezone: "Europe/Berlin", resumeMd: "# Demo" })));
      expect(await getProfile(s)).toEqual({ headline: "Designer", timezone: "Europe/Berlin", resumeMd: "# Demo" });

      expectOk(await saveProfile(s, profileInputSchema.parse({ headline: "", timezone: "UTC", resumeMd: "" })));
      expect(await getProfile(s)).toEqual({ headline: null, timezone: "UTC", resumeMd: null });
      expect(await getPreferences(s)).toEqual(prefs);
    } finally {
      await close();
    }
  });

  it("keeps each user's profile apart", async () => {
    const { db, close } = await makeTestDb();
    try {
      const alice = await createTestUser(db, "profile-alice@example.com");
      const bob = await createTestUser(db, "profile-bob@example.com");
      expectOk(await saveProfile(scoped(db, alice.id), profileInputSchema.parse({ headline: "Alice", timezone: "UTC", resumeMd: "" })));
      expect((await getProfile(scoped(db, bob.id))).headline).toBeNull();
    } finally {
      await close();
    }
  });
});
