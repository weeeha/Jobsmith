import { afterEach, describe, expect, it, vi } from "vitest";
import { createOpenAiCompatibleDriver } from "@/lib/tts/openai-compatible";
import { createGeminiDriver } from "@/lib/tts/gemini";
import { createElevenLabsDriver } from "@/lib/tts/elevenlabs";
import { ttsDriverFromConfig } from "@/lib/tts";
import type { TtsConfig } from "@/lib/tts/config";
import type { TtsDriver } from "@/lib/tts/driver";
import { bytesResponse, jsonResponse, recordingFetch } from "../helpers/tts-fetch";

const key = "k".repeat(24);
const configs: TtsConfig[] = [
  { provider: "openai_compatible", model: "local", baseUrl: "http://127.0.0.1:8890/v1", apiKey: key },
  { provider: "gemini", model: "gemini-2.5-flash-preview-tts", baseUrl: null, apiKey: key },
  { provider: "elevenlabs", model: "eleven_flash_v2_5", baseUrl: null, apiKey: key },
];
const SECRET_TEXT = "Private interview answer about a layoff.";

function answerFor(provider: string): Response {
  if (provider === "gemini") {
    return jsonResponse({ candidates: [{ content: { parts: [{ inlineData: { data: Buffer.from([1, 0, 2, 0]).toString("base64") } }] } }] });
  }
  return bytesResponse([0xff, 0xfb, 0x50, 0xc0, 0, 0], "audio/mpeg");
}

function build(config: TtsConfig, fetchImpl: typeof fetch): TtsDriver {
  if (config.provider === "openai_compatible") return createOpenAiCompatibleDriver(config, fetchImpl);
  if (config.provider === "gemini") return createGeminiDriver(config, fetchImpl);
  return createElevenLabsDriver(config, fetchImpl);
}

afterEach(() => vi.restoreAllMocks());

describe("TTS driver contract", () => {
  it("every driver has a name equal to its provider and a 30 second request timeout", async () => {
    for (const config of configs) {
      const timeouts: number[] = [];
      const real = AbortSignal.timeout.bind(AbortSignal);
      const spy = vi.spyOn(AbortSignal, "timeout").mockImplementation((ms) => {
        timeouts.push(ms);
        return real(ms);
      });
      const driver = build(config, recordingFetch(answerFor(config.provider)).fetch);
      expect(driver.name).toBe(config.provider);
      await driver.synthesize({ text: "Hi.", voice: "v", style: "default", format: "mp3" });
      expect(timeouts).toEqual([30_000]);
      spy.mockRestore();
    }
  });

  it("allows a longer timeout through an option", async () => {
    const timeouts: number[] = [];
    const real = AbortSignal.timeout.bind(AbortSignal);
    vi.spyOn(AbortSignal, "timeout").mockImplementation((ms) => {
      timeouts.push(ms);
      return real(ms);
    });
    const driver = createOpenAiCompatibleDriver(configs[0], recordingFetch(answerFor("openai_compatible")).fetch, { timeoutMs: 120_000 });
    await driver.synthesize({ text: "Hi.", voice: "v", style: "default", format: "mp3" });
    expect(timeouts).toEqual([120_000]);
  });

  it("no driver logs the text or the key, on success or failure", async () => {
    const spies = (["log", "info", "warn", "error", "debug"] as const).map((m) => vi.spyOn(console, m).mockImplementation(() => {}));
    for (const config of configs) {
      for (const answer of [answerFor(config.provider), new Response("boom", { status: 500 }), new TypeError("fetch failed")]) {
        const driver = build(config, recordingFetch(answer).fetch);
        const result = await driver.synthesize({ text: SECRET_TEXT, voice: "v", style: "default", format: "mp3" });
        if (!result.ok) {
          expect(result.message).not.toContain(SECRET_TEXT);
          expect(result.message).not.toContain(key);
        }
        await driver.voices();
      }
    }
    for (const spy of spies) expect(spy).not.toHaveBeenCalled();
  });

  it("ttsDriverFromConfig builds all four drivers and passes the injected fetch through", async () => {
    for (const config of [...configs, { provider: "fake", model: "fake-tts", baseUrl: null, apiKey: null } as TtsConfig]) {
      const { fetch, calls } = recordingFetch(answerFor(config.provider));
      const driver = ttsDriverFromConfig(config, { fetch });
      expect(driver.name).toBe(config.provider);
      await driver.synthesize({ text: "Hi there.", voice: "v", style: "default", format: "mp3" });
      expect(calls).toHaveLength(config.provider === "fake" ? 0 : 1);
    }
  });
});
