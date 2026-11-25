import { describe, expect, it, vi } from "vitest";
import { makeTestDb, createTestUser } from "../helpers/db";
import { scoped } from "@/lib/db/scoped";
import { audioContext } from "@/lib/prep/audio-status";
import { loadPrepHub } from "@/lib/prep/hub";
import { savePrepSettings, DEFAULT_PREP_SETTINGS } from "@/lib/prep/settings";
import { DEFAULT_LOCAL_VOICES } from "@/lib/prep/values";
import { createFakeTtsDriver } from "@/lib/tts/fake";
import type { TtsConfig } from "@/lib/tts/config";

const CONFIG: TtsConfig = { provider: "fake", model: "fake-tts", baseUrl: null, apiKey: null };

function spyDriver() {
  const driver = createFakeTtsDriver();
  const voices = vi.fn(async () => {
    throw new Error("the hub must not call the provider");
  });
  return { driver: { ...driver, voices }, voices };
}

describe("audioContext", () => {
  it("makes no provider call when no voices are saved, and falls back to the code defaults", async () => {
    const { db, close } = await makeTestDb();
    const user = await createTestUser(db, "ctx-a@example.com");
    const s = scoped(db, user.id);
    const { driver, voices } = spyDriver();
    const context = await audioContext(s, { tts: driver }, CONFIG);
    expect(voices).not.toHaveBeenCalled();
    expect(context.voices).toEqual({ ...DEFAULT_LOCAL_VOICES });
    expect(context.ttsOn).toBe(true);
    await close();
  });

  it("uses the saved voices without a provider call", async () => {
    const { db, close } = await makeTestDb();
    const user = await createTestUser(db, "ctx-b@example.com");
    const s = scoped(db, user.id);
    await savePrepSettings(s, {
      voices: { interviewer: "Aria", candidate: "Ryan" },
      speed: DEFAULT_PREP_SETTINGS.speed,
      gapFactor: DEFAULT_PREP_SETTINGS.gapFactor,
      browserVoices: { interviewer: null, candidate: null },
    });
    const { driver, voices } = spyDriver();
    const context = await audioContext(s, { tts: driver }, CONFIG);
    expect(voices).not.toHaveBeenCalled();
    expect(context.voices).toEqual({ interviewer: "Aria", candidate: "Ryan" });
    await close();
  });

  it("loadPrepHub with that context never calls voices()", async () => {
    const { db, close } = await makeTestDb();
    const user = await createTestUser(db, "ctx-c@example.com");
    const s = scoped(db, user.id);
    const { driver, voices } = spyDriver();
    const audio = await audioContext(s, { tts: driver }, CONFIG);
    await loadPrepHub(s, { opportunityId: "00000000-0000-0000-0000-000000000000", docs: [], stages: [], audio });
    expect(voices).not.toHaveBeenCalled();
    await close();
  });
});
