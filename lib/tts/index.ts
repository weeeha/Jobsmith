import { env } from "@/lib/env";
import type { TtsConfig } from "./config";
import type { TtsDriver } from "./driver";
import { createElevenLabsDriver } from "./elevenlabs";
import { createFakeTtsDriver } from "./fake";
import { createGeminiDriver } from "./gemini";
import { createOpenAiCompatibleDriver } from "./openai-compatible";

export function ttsDriverFromConfig(config: TtsConfig, deps: { fetch?: typeof fetch } = {}): TtsDriver {
  switch (config.provider) {
    case "fake":
      return createFakeTtsDriver();
    case "openai_compatible":
      return createOpenAiCompatibleDriver(config, deps.fetch);
    case "gemini":
      return createGeminiDriver(config, deps.fetch);
    case "elevenlabs":
      return createElevenLabsDriver(config, deps.fetch);
  }
}

let cached: TtsDriver | null | undefined;

export function getTtsDriver(): TtsDriver | null {
  if (cached === undefined) {
    const config = env().TTS;
    cached = config ? ttsDriverFromConfig(config) : null;
  }
  return cached;
}
