import { fail, ok } from "@/lib/result";
import type { TtsConfig } from "./config";
import type { TtsDriver, TtsRequest, Voice } from "./driver";
import { requestBytes, requestJson, TTS_TIMEOUT_MS, type TtsDriverOptions } from "./http";

const API = "https://api.elevenlabs.io/v1";

// UNVERIFIED: endpoint, output_format value and the voices answer follow the
// plan's contract. Check elevenlabs.io/docs/api-reference/text-to-speech/convert
// and elevenlabs.io/docs/api-reference/voices/search.
export function createElevenLabsDriver(
  config: TtsConfig,
  fetchImpl: typeof fetch = fetch,
  options: TtsDriverOptions = {},
): TtsDriver {
  const timeoutMs = options.timeoutMs ?? TTS_TIMEOUT_MS;
  return {
    name: "elevenlabs",
    // No style support: a strict retry sends the same request.
    async synthesize(request: TtsRequest) {
      if (!config.apiKey) return fail("tts_error", "no API key configured");
      const result = await requestBytes(
        fetchImpl,
        `${API}/text-to-speech/${encodeURIComponent(request.voice)}?output_format=mp3_44100_64`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json", "xi-api-key": config.apiKey },
          body: JSON.stringify({ text: request.text, model_id: config.model }),
        },
        timeoutMs,
      );
      if (!result.ok) return result;
      return ok({ audio: result.data.bytes, contentType: result.data.contentType ?? "audio/mpeg" });
    },
    async voices() {
      if (!config.apiKey) return [];
      const raw = (await requestJson(fetchImpl, `${API}/voices`, { headers: { "xi-api-key": config.apiKey } }, timeoutMs)) as {
        voices?: { voice_id?: unknown; name?: unknown; labels?: { language?: unknown } }[];
      } | null;
      if (!raw || !Array.isArray(raw.voices)) return [];
      const voices: Voice[] = [];
      for (const v of raw.voices) {
        if (typeof v?.voice_id !== "string" || v.voice_id === "") continue;
        const language = typeof v.labels?.language === "string" ? v.labels.language : null;
        voices.push({ id: v.voice_id, label: typeof v.name === "string" && v.name !== "" ? v.name : v.voice_id, language });
      }
      return voices;
    },
  };
}
