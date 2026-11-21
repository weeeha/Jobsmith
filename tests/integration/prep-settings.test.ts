import { describe, expect, it } from "vitest";
import { makeTestDb, createTestUser } from "../helpers/db";
import { scoped } from "@/lib/db/scoped";
import { getPrepSettings, prepSettingsInputSchema, savePrepSettings, DEFAULT_PREP_SETTINGS } from "@/lib/prep/settings";
import { expectOk } from "../helpers/result";

const input = prepSettingsInputSchema.parse({
  voices: { interviewer: "Vivian", candidate: "Ryan" },
  speed: 1.3,
  gapFactor: 0.5,
  browserVoices: { interviewer: "Samantha", candidate: null },
});

describe("prep settings store", () => {
  it("savePrepSettings writes profile.prep and leaves headline, resume, preferences and time zone alone", async () => {
    const { db, close } = await makeTestDb();
    try {
      const user = await createTestUser(db, "prep-settings-owner@example.com");
      const s = scoped(db, user.id);
      await s.profile.upsert({ headline: "Designer", resumeMd: "# CV", preferences: { titles: ["x"] }, timezone: "America/Toronto" });
      const saved = expectOk(await savePrepSettings(s, input));
      expect(saved).toEqual({ version: 1, voices: { interviewer: "Vivian", candidate: "Ryan" }, speed: 1.3, gapFactor: 0.5, browserVoices: { interviewer: "Samantha", candidate: null } });
      const row = await s.profile.get();
      expect(row?.prep).toEqual(saved);
      expect(row).toMatchObject({ headline: "Designer", resumeMd: "# CV", preferences: { titles: ["x"] }, timezone: "America/Toronto" });
      expect(await getPrepSettings(s)).toEqual(saved);
    } finally {
      await close();
    }
  });

  it("getPrepSettings creates nothing: a user with no profile row gets the defaults", async () => {
    const { db, close } = await makeTestDb();
    try {
      const user = await createTestUser(db, "prep-settings-none@example.com");
      const s = scoped(db, user.id);
      expect(await getPrepSettings(s)).toEqual(DEFAULT_PREP_SETTINGS);
      expect(await s.profile.get()).toBeNull();
    } finally {
      await close();
    }
  });

  it("saving for one user does not touch another", async () => {
    const { db, close } = await makeTestDb();
    try {
      const a = scoped(db, (await createTestUser(db, "prep-settings-a@example.com")).id);
      const b = scoped(db, (await createTestUser(db, "prep-settings-b@example.com")).id);
      await savePrepSettings(a, input);
      expect(await getPrepSettings(b)).toEqual(DEFAULT_PREP_SETTINGS);
    } finally {
      await close();
    }
  });
});
