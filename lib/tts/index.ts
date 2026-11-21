import { env } from "@/lib/env";
import type { TtsConfig } from "./config";
import type { TtsDriver } from "./driver";
import { createFakeTtsDriver } from "./fake";

export function ttsDriverFromConfig(config: TtsConfig, deps: { fetch?: typeof fetch } = {}): TtsDriver {
  void deps;
  switch (config.provider) {
    case "fake":
      return createFakeTtsDriver();
    default:
      throw new Error(`TTS provider ${config.provider} is not wired yet`);
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
