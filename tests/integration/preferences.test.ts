import { describe, expect, it } from "vitest";
import { makeTestDb, createTestUser } from "../helpers/db";
import { scoped } from "@/lib/db/scoped";
import { DEFAULT_PREFERENCES, preferencesInputSchema } from "@/lib/preferences/schema";
import { getPreferences, savePreferences } from "@/lib/preferences/save";
import { expectOk } from "../helpers/result";

const input = preferencesInputSchema.parse({
  titles: ["Product designer", "Design lead"],
  seniority: ["senior", "staff"],
  locations: ["Remote"],
  workModes: ["remote", "hybrid"],
  compFloor: null,
  compTarget: null,
  currency: "USD",
  mustHaves: ["Design system work"],
  dealbreakers: ["Relocation required"],
  industriesAvoid: ["Gambling"],
  sizeMin: 50,
  sizeMax: 2000,
  scoreThreshold: 75,
  followUpDays: 10,
  savedDays: 4,
});

describe("preferences store", () => {
  it("reads the defaults before anything is saved, then what was saved", async () => {
    const { db, close } = await makeTestDb();
    try {
      const user = await createTestUser(db, "prefs-owner@example.com");
      const s = scoped(db, user.id);
      expect(await getPreferences(s)).toEqual(DEFAULT_PREFERENCES);
      const saved = expectOk(await savePreferences(s, input));
      expect(await getPreferences(s)).toEqual(saved);
      expect(saved.attention).toEqual({ followUpDays: 10, savedDays: 4 });
    } finally {
      await close();
    }
  });

  it("leaves the headline, resume and time zone alone", async () => {
    const { db, close } = await makeTestDb();
    try {
      const user = await createTestUser(db, "prefs-profile@example.com");
      const s = scoped(db, user.id);
      await s.profile.upsert({ headline: "Designer", resumeMd: "# Resume", timezone: "Europe/Berlin" });
      expectOk(await savePreferences(s, input));
      const row = await s.profile.get();
      expect(row?.headline).toBe("Designer");
      expect(row?.resumeMd).toBe("# Resume");
      expect(row?.timezone).toBe("Europe/Berlin");
    } finally {
      await close();
    }
  });

  it("keeps each user's preferences apart", async () => {
    const { db, close } = await makeTestDb();
    try {
      const alice = await createTestUser(db, "prefs-alice@example.com");
      const bob = await createTestUser(db, "prefs-bob@example.com");
      expectOk(await savePreferences(scoped(db, alice.id), input));
      expect(await getPreferences(scoped(db, bob.id))).toEqual(DEFAULT_PREFERENCES);
    } finally {
      await close();
    }
  });
});
