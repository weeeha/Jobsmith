import { describe, expect, it } from "vitest";
import {
  DEFAULT_PREP_SETTINGS,
  GAP_FACTOR_MAX,
  GAP_FACTOR_MIN,
  SPEED_MAX,
  SPEED_MIN,
  parsePrepSettings,
  prepSettingsInputSchema,
  resolveVoices,
  type PrepSettings,
} from "@/lib/prep/settings";
import { DEFAULT_LOCAL_VOICES } from "@/lib/prep/values";
import type { Voice } from "@/lib/tts/driver";

const voice = (id: string): Voice => ({ id, label: id, language: null });
const base = (over: Partial<PrepSettings> = {}): PrepSettings => ({ ...DEFAULT_PREP_SETTINGS, ...over });
const validInput = {
  voices: { interviewer: "Vivian", candidate: "Ryan" },
  speed: 1.2,
  gapFactor: 1.5,
  browserVoices: { interviewer: null, candidate: null },
};

describe("parsePrepSettings", () => {
  it("of {} or garbage returns the defaults: speed 1, gapFactor 1, null voices", () => {
    const defaults = { version: 1, voices: { interviewer: null, candidate: null }, speed: 1, gapFactor: 1, browserVoices: { interviewer: null, candidate: null } };
    expect(parsePrepSettings({})).toEqual(defaults);
    for (const garbage of [null, undefined, "x", 7, [], { voices: 4 }]) expect(parsePrepSettings(garbage)).toEqual(defaults);
  });

  it("each field falls back on its own: a bad speed does not drop good voices", () => {
    const parsed = parsePrepSettings({ voices: { interviewer: "Aria", candidate: 5 }, speed: "fast", gapFactor: 1.5, browserVoices: { candidate: "Samantha" } });
    expect(parsed.voices).toEqual({ interviewer: "Aria", candidate: null });
    expect(parsed.speed).toBe(1);
    expect(parsed.gapFactor).toBe(1.5);
    expect(parsed.browserVoices).toEqual({ interviewer: null, candidate: "Samantha" });
  });

  it("speed outside 0.8 to 1.5 and gapFactor outside 0.5 to 2 read as their defaults", () => {
    expect(parsePrepSettings({ speed: 0.7, gapFactor: 2.5 })).toMatchObject({ speed: 1, gapFactor: 1 });
    expect(parsePrepSettings({ speed: 1.6, gapFactor: 0.4 })).toMatchObject({ speed: 1, gapFactor: 1 });
    expect(parsePrepSettings({ speed: SPEED_MIN, gapFactor: GAP_FACTOR_MIN })).toMatchObject({ speed: 0.8, gapFactor: 0.5 });
    expect(parsePrepSettings({ speed: SPEED_MAX, gapFactor: GAP_FACTOR_MAX })).toMatchObject({ speed: 1.5, gapFactor: 2 });
  });
});

describe("prepSettingsInputSchema", () => {
  it("rounds speed to one decimal", () => {
    expect(prepSettingsInputSchema.parse({ ...validInput, speed: 1.24 }).speed).toBe(1.2);
    expect(prepSettingsInputSchema.parse({ ...validInput, speed: 1.26 }).speed).toBe(1.3);
  });

  it("rejects out-of-range values with explicit messages", () => {
    const speed = prepSettingsInputSchema.safeParse({ ...validInput, speed: 2 });
    expect(speed.success).toBe(false);
    expect(speed.error?.issues[0]).toMatchObject({ path: ["speed"], message: "Enter a speed from 0.8 to 1.5." });
    const gap = prepSettingsInputSchema.safeParse({ ...validInput, gapFactor: 3 });
    expect(gap.error?.issues[0]).toMatchObject({ path: ["gapFactor"], message: "Enter a pause factor from 0.5 to 2." });
    expect(prepSettingsInputSchema.safeParse({ ...validInput, speed: "fast" }).success).toBe(false);
  });

  it("turns a blank voice into null and trims the others", () => {
    const parsed = prepSettingsInputSchema.parse({
      ...validInput,
      voices: { interviewer: "   ", candidate: " Ryan " },
      browserVoices: { interviewer: "", candidate: null },
    });
    expect(parsed.voices).toEqual({ interviewer: null, candidate: "Ryan" });
    expect(parsed.browserVoices).toEqual({ interviewer: null, candidate: null });
  });

  it("is strict: an unknown key is rejected", () => {
    expect(prepSettingsInputSchema.safeParse({ ...validInput, extra: 1 }).success).toBe(false);
  });
});

describe("resolveVoices", () => {
  it("uses the saved voice ids first", () => {
    const settings = base({ voices: { interviewer: "Aria", candidate: "Zed" } });
    expect(resolveVoices(settings, [voice("Vivian"), voice("Ryan")])).toEqual({ interviewer: "Aria", candidate: "Zed" });
  });

  it("with no saved voices and a list holding Vivian and Ryan picks those two", () => {
    expect(resolveVoices(base(), [voice("Aria"), voice("Ryan"), voice("Vivian")])).toEqual({ interviewer: "Vivian", candidate: "Ryan" });
  });

  it("with a list that lacks them picks the first two, and the same voice twice for a one-voice list", () => {
    expect(resolveVoices(base(), [voice("Aria"), voice("Bo"), voice("Cy")])).toEqual({ interviewer: "Aria", candidate: "Bo" });
    expect(resolveVoices(base(), [voice("Solo")])).toEqual({ interviewer: "Solo", candidate: "Solo" });
  });

  it("with an empty list returns DEFAULT_LOCAL_VOICES", () => {
    expect(resolveVoices(base(), [])).toEqual(DEFAULT_LOCAL_VOICES);
  });

  it("fills only the missing side from the provider list", () => {
    const settings = base({ voices: { interviewer: null, candidate: "Zed" } });
    expect(resolveVoices(settings, [voice("Aria"), voice("Bo")])).toEqual({ interviewer: "Aria", candidate: "Zed" });
  });
});
