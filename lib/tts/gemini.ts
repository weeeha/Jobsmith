import { fail, ok } from "@/lib/result";
import type { TtsConfig } from "./config";
import type { TtsDriver, TtsRequest, Voice } from "./driver";
import { requestBytes, TTS_TIMEOUT_MS, type TtsDriverOptions } from "./http";

// UNVERIFIED: the prebuilt voice names are from memory of Google's speech
// generation page (ai.google.dev/gemini-api/docs/speech-generation). An owner
// should compare this list with the current "Voice options" table.
export const GEMINI_VOICES = [
  "Zephyr", "Puck", "Charon", "Kore", "Fenrir", "Leda", "Orus", "Aoede", "Callirrhoe", "Autonoe",
  "Enceladus", "Iapetus", "Umbriel", "Algieba", "Despina", "Erinome", "Algenib", "Rasalgethi",
  "Laomedeia", "Achernar", "Alnilam", "Schedar", "Gacrux", "Pulcherrima", "Achird",
  "Zubenelgenubi", "Vindemiatrix", "Sadachbia", "Sadaltager", "Sulafat",
];

const ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models";
const SAMPLE_RATE = 24_000;
const STRICT_PREFIX = "Read every sentence to the end: ";

function inlineAudio(bytes: Uint8Array): Uint8Array | null {
  try {
    const parsed = JSON.parse(new TextDecoder().decode(bytes)) as {
      candidates?: { content?: { parts?: { inlineData?: { data?: unknown } }[] } }[];
    };
    const data = parsed.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
    if (typeof data !== "string" || data === "") return null;
    const audio = new Uint8Array(Buffer.from(data, "base64"));
    return audio.length === 0 ? null : audio;
  } catch {
    return null;
  }
}

export function createGeminiDriver(
  config: TtsConfig,
  fetchImpl: typeof fetch = fetch,
  options: TtsDriverOptions = {},
): TtsDriver {
  const timeoutMs = options.timeoutMs ?? TTS_TIMEOUT_MS;
  return {
    name: "gemini",
    async synthesize(request: TtsRequest) {
      if (!config.apiKey) return fail("tts_error", "no API key configured");
      // UNVERIFIED shape: request body and response path follow the plan's
      // contract. Check ai.google.dev/gemini-api/docs/speech-generation.
      const body = {
        contents: [{ parts: [{ text: request.style === "strict" ? `${STRICT_PREFIX}${request.text}` : request.text }] }],
        generationConfig: {
          responseModalities: ["AUDIO"],
          speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: request.voice } } },
        },
      };
      const result = await requestBytes(
        fetchImpl,
        `${ENDPOINT}/${encodeURIComponent(config.model)}:generateContent`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-goog-api-key": config.apiKey },
          body: JSON.stringify(body),
        },
        timeoutMs,
      );
      if (!result.ok) return result;
      const audio = inlineAudio(result.data.bytes);
      if (audio === null) return fail("tts_bad_output", "no audio in the answer");
      return ok({ audio, contentType: "audio/L16", sampleRate: SAMPLE_RATE });
    },
    async voices() {
      return GEMINI_VOICES.map((id): Voice => ({ id, label: id, language: null }));
    },
  };
}
