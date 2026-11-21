import { z } from "zod";
import type { Scoped } from "@/lib/db/scoped";
import { ok, type Result } from "@/lib/result";
import type { Voice } from "@/lib/tts/driver";
import { DEFAULT_LOCAL_VOICES } from "./values";

export const PREP_SETTINGS_VERSION = 1;
export const SPEED_MIN = 0.8;
export const SPEED_MAX = 1.5;
export const GAP_FACTOR_MIN = 0.5;
export const GAP_FACTOR_MAX = 2;

export type VoicePair<T> = { interviewer: T; candidate: T };
export type PrepSettings = {
  version: 1;
  voices: VoicePair<string | null>;
  speed: number;
  gapFactor: number;
  browserVoices: VoicePair<string | null>;
};

export const DEFAULT_PREP_SETTINGS: PrepSettings = {
  version: PREP_SETTINGS_VERSION,
  voices: { interviewer: null, candidate: null },
  speed: 1,
  gapFactor: 1,
  browserVoices: { interviewer: null, candidate: null },
};

// ---------- reading a stored document (never throws) ----------

const storedVoice = z.string().min(1).max(200).nullable().catch(null);
const storedPair = z
  .object({ interviewer: storedVoice, candidate: storedVoice })
  .catch({ interviewer: null, candidate: null });

const storedSchema = z.object({
  version: z.literal(PREP_SETTINGS_VERSION).catch(PREP_SETTINGS_VERSION),
  voices: storedPair,
  speed: z.number().min(SPEED_MIN).max(SPEED_MAX).catch(DEFAULT_PREP_SETTINGS.speed),
  gapFactor: z.number().min(GAP_FACTOR_MIN).max(GAP_FACTOR_MAX).catch(DEFAULT_PREP_SETTINGS.gapFactor),
  browserVoices: storedPair,
});

export function parsePrepSettings(raw: unknown): PrepSettings {
  const parsed = storedSchema.safeParse(raw ?? {});
  return parsed.success ? (parsed.data as PrepSettings) : structuredClone(DEFAULT_PREP_SETTINGS);
}

// ---------- saving from the form (strict) ----------

const SPEED_MESSAGE = "Enter a speed from 0.8 to 1.5.";
const GAP_MESSAGE = "Enter a pause factor from 0.5 to 2.";

const inputVoice = z
  .string({ error: "Pick a voice from the list." })
  .trim()
  .max(200, "Keep the voice name under 200 characters.")
  .transform((value) => (value === "" ? null : value))
  .nullable();
const inputPair = z.strictObject({ interviewer: inputVoice, candidate: inputVoice });

export const prepSettingsInputSchema = z.strictObject({
  voices: inputPair,
  speed: z
    .number({ error: SPEED_MESSAGE })
    .transform((value) => Math.round(value * 10) / 10)
    .pipe(z.number().min(SPEED_MIN, SPEED_MESSAGE).max(SPEED_MAX, SPEED_MESSAGE)),
  gapFactor: z.number({ error: GAP_MESSAGE }).min(GAP_FACTOR_MIN, GAP_MESSAGE).max(GAP_FACTOR_MAX, GAP_MESSAGE),
  browserVoices: inputPair,
});

export type PrepSettingsInput = z.infer<typeof prepSettingsInputSchema>;

export async function getPrepSettings(s: Scoped): Promise<PrepSettings> {
  const row = await s.profile.get();
  return parsePrepSettings(row?.prep);
}

/** Replaces the whole document. Headline, resume, preferences and time zone are left as they are. */
export async function savePrepSettings(s: Scoped, input: PrepSettingsInput): Promise<Result<PrepSettings, never>> {
  const document: PrepSettings = {
    version: PREP_SETTINGS_VERSION,
    voices: { ...input.voices },
    speed: input.speed,
    gapFactor: input.gapFactor,
    browserVoices: { ...input.browserVoices },
  };
  await s.profile.upsert({ prep: document });
  return ok(document);
}

// Saved ids win. Without them: Vivian and Ryan when the provider lists them,
// otherwise its first two voices (one voice twice for a one-voice list), and
// DEFAULT_LOCAL_VOICES when it lists none (spec 5.5).
export function resolveVoices(settings: PrepSettings, available: Voice[]): VoicePair<string> {
  const ids = available.map((v) => v.id);
  let fallback: VoicePair<string>;
  if (ids.length === 0) {
    fallback = { ...DEFAULT_LOCAL_VOICES };
  } else if (ids.includes(DEFAULT_LOCAL_VOICES.interviewer) && ids.includes(DEFAULT_LOCAL_VOICES.candidate)) {
    fallback = { ...DEFAULT_LOCAL_VOICES };
  } else {
    fallback = { interviewer: ids[0], candidate: ids[1] ?? ids[0] };
  }
  return {
    interviewer: settings.voices.interviewer ?? fallback.interviewer,
    candidate: settings.voices.candidate ?? fallback.candidate,
  };
}
