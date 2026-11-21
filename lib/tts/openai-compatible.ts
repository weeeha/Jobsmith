import { fail, ok } from "@/lib/result";
import type { TtsConfig } from "./config";
import { STRICT_INSTRUCTION, type TtsDriver, type TtsRequest, type Voice } from "./driver";
import { requestBytes, requestJson, TTS_TIMEOUT_MS, type TtsDriverOptions } from "./http";

function parseVoices(raw: unknown): Voice[] | null {
  const list = Array.isArray(raw)
    ? raw
    : typeof raw === "object" && raw !== null && Array.isArray((raw as { voices?: unknown }).voices)
      ? (raw as { voices: unknown[] }).voices
      : null;
  if (list === null) return null;
  const voices: Voice[] = [];
  for (const entry of list) {
    if (typeof entry === "string" && entry !== "") {
      voices.push({ id: entry, label: entry, language: null });
    } else if (typeof entry === "object" && entry !== null) {
      const o = entry as { id?: unknown; name?: unknown; language?: unknown };
      const id = typeof o.id === "string" && o.id !== "" ? o.id : typeof o.name === "string" && o.name !== "" ? o.name : null;
      if (id === null) continue;
      const label = typeof o.name === "string" && o.name !== "" ? o.name : id;
      voices.push({ id, label, language: typeof o.language === "string" ? o.language : null });
    }
  }
  return voices;
}

// Works against OpenAI's own endpoint and the owner's local Qwen3-TTS server.
export function createOpenAiCompatibleDriver(
  config: TtsConfig,
  fetchImpl: typeof fetch = fetch,
  options: TtsDriverOptions = {},
): TtsDriver {
  const base = (config.baseUrl ?? "").replace(/\/+$/, "");
  const timeoutMs = options.timeoutMs ?? TTS_TIMEOUT_MS;
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (config.apiKey) headers.Authorization = `Bearer ${config.apiKey}`;

  return {
    name: "openai_compatible",
    async synthesize(request: TtsRequest) {
      if (base === "") return fail("tts_error", "no base URL configured");
      const body: Record<string, string> = {
        model: config.model,
        input: request.text,
        voice: request.voice,
        response_format: request.format,
      };
      if (request.style === "strict") body.instructions = STRICT_INSTRUCTION;
      const result = await requestBytes(
        fetchImpl,
        `${base}/audio/speech`,
        { method: "POST", headers, body: JSON.stringify(body) },
        timeoutMs,
      );
      if (!result.ok) return result;
      return ok({
        audio: result.data.bytes,
        contentType: result.data.contentType ?? (request.format === "wav" ? "audio/wav" : "audio/mpeg"),
      });
    },
    async voices() {
      if (base === "") return [];
      const readHeaders: Record<string, string> = config.apiKey ? { Authorization: `Bearer ${config.apiKey}` } : {};
      for (const path of ["/audio/voices", "/voices"]) {
        const voices = parseVoices(await requestJson(fetchImpl, `${base}${path}`, { headers: readHeaders }, timeoutMs));
        if (voices !== null) return voices;
      }
      return [];
    },
  };
}
