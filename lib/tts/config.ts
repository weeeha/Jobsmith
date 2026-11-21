// Imports nothing heavy, so the CLI bundle can read it.
export const TTS_PROVIDERS = ["openai_compatible", "gemini", "elevenlabs", "fake"] as const;
export type TtsProvider = (typeof TTS_PROVIDERS)[number];

export type TtsConfig = { provider: TtsProvider; model: string; baseUrl: string | null; apiKey: string | null };
export type TtsIdentity = { provider: string; model: string };

// null: the spec gives elevenlabs no default, so TTS_MODEL is required there.
export const DEFAULT_TTS_MODELS: Record<TtsProvider, string | null> = {
  openai_compatible: "local",
  gemini: "gemini-2.5-flash-preview-tts",
  elevenlabs: null,
  fake: "fake-tts",
};

// What clips from the owner's laptop are stored under when the server has no
// TTS of its own (README owner answer 1). ttsIdentity is the one place that
// decides it.
export const CLI_TTS_IDENTITY: TtsIdentity = { provider: "openai_compatible", model: "local" };
export const DEFAULT_CLI_TTS_URL = "http://127.0.0.1:8890/v1";

const MODEL_PATTERN = /^[A-Za-z0-9._:/-]{1,100}$/;

function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

export function parseTtsConfig(
  source: Record<string, string | undefined>,
): { ok: true; config: TtsConfig | null } | { ok: false; invalid: string[] } {
  const providerRaw = source.TTS_PROVIDER;
  // Unset or blank means TTS is off, on purpose: a leftover GEMINI_API_KEY
  // must never send interview answers to a provider by accident.
  if (!providerRaw) return { ok: true, config: null };
  if (!(TTS_PROVIDERS as readonly string[]).includes(providerRaw)) {
    return { ok: false, invalid: ["TTS_PROVIDER"] };
  }
  const provider = providerRaw as TtsProvider;

  const invalid: string[] = [];
  let model = DEFAULT_TTS_MODELS[provider];
  if (source.TTS_MODEL) {
    if (!MODEL_PATTERN.test(source.TTS_MODEL)) invalid.push("TTS_MODEL");
    else model = source.TTS_MODEL;
  }

  let baseUrl: string | null = null;
  let apiKey: string | null = null;
  if (provider === "openai_compatible") {
    const raw = source.TTS_BASE_URL?.trim();
    if (!raw || !isHttpUrl(raw)) invalid.push("TTS_BASE_URL");
    else baseUrl = raw;
    apiKey = source.TTS_API_KEY || null;
  } else if (provider === "gemini") {
    if (!source.GEMINI_API_KEY) invalid.push("GEMINI_API_KEY");
    else apiKey = source.GEMINI_API_KEY;
  } else if (provider === "elevenlabs") {
    if (!source.ELEVENLABS_API_KEY) invalid.push("ELEVENLABS_API_KEY");
    else apiKey = source.ELEVENLABS_API_KEY;
    if (!source.TTS_MODEL) invalid.push("TTS_MODEL");
  }

  if (invalid.length > 0) return { ok: false, invalid };
  return { ok: true, config: { provider, model: model as string, baseUrl, apiKey } };
}

export function ttsIdentity(config: TtsConfig | null): TtsIdentity {
  return config ? { provider: config.provider, model: config.model } : { ...CLI_TTS_IDENTITY };
}
