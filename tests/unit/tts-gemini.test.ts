import { describe, expect, it } from "vitest";
import { createGeminiDriver, GEMINI_VOICES } from "@/lib/tts/gemini";
import type { TtsConfig } from "@/lib/tts/config";
import { jsonResponse, recordingFetch, timeoutError } from "../helpers/tts-fetch";
import { expectFail, expectOk } from "../helpers/result";

const key = "k".repeat(24);
const config: TtsConfig = { provider: "gemini", model: "gemini-2.5-flash-preview-tts", baseUrl: null, apiKey: key };
const request = (over: Record<string, unknown> = {}) => ({
  text: "Hello there.",
  voice: "Kore",
  style: "default" as const,
  format: "mp3" as const,
  ...over,
});
const pcm = Buffer.from([1, 0, 2, 0, 3, 0, 4, 0]);
const answer = (data: string | undefined = pcm.toString("base64")) =>
  jsonResponse({ candidates: [{ content: { parts: [{ inlineData: { mimeType: "audio/L16;codec=pcm;rate=24000", data } }] } }] });

describe("gemini driver", () => {
  it("sends the documented URL, headers and body fields", async () => {
    const { fetch, calls } = recordingFetch(answer());
    expectOk(await createGeminiDriver(config, fetch).synthesize(request()));
    expect(calls[0].url).toBe(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-tts:generateContent",
    );
    expect(calls[0].method).toBe("POST");
    expect(calls[0].headers["x-goog-api-key"]).toBe(key);
    expect(calls[0].headers["content-type"]).toBe("application/json");
    expect(JSON.parse(calls[0].body!)).toEqual({
      contents: [{ parts: [{ text: "Hello there." }] }],
      generationConfig: {
        responseModalities: ["AUDIO"],
        speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: "Kore" } } },
      },
    });
  });

  it("never puts the API key in the URL", async () => {
    const { fetch, calls } = recordingFetch(answer());
    await createGeminiDriver(config, fetch).synthesize(request());
    expect(calls[0].url).not.toContain(key);
    expect(calls[0].url).not.toContain("key=");
  });

  it("decodes the base64 PCM and reports sampleRate 24000", async () => {
    const { fetch } = recordingFetch(answer());
    const audio = expectOk(await createGeminiDriver(config, fetch).synthesize(request()));
    expect(audio.contentType).toBe("audio/L16");
    expect(audio.sampleRate).toBe(24000);
    expect(Array.from(audio.audio)).toEqual(Array.from(pcm));
  });

  it("a strict retry prefixes the text, a default call does not", async () => {
    const { fetch, calls } = recordingFetch(answer());
    await createGeminiDriver(config, fetch).synthesize(request({ style: "strict" }));
    expect(JSON.parse(calls[0].body!).contents[0].parts[0].text).toBe("Read every sentence to the end: Hello there.");
  });

  it("maps 429, other non-2xx, timeout and empty or missing audio", async () => {
    const run = async (a: Response | Error) => createGeminiDriver(config, recordingFetch(a).fetch).synthesize(request());
    expectFail(await run(new Response("quota", { status: 429 })), "tts_rate_limited");
    expectFail(await run(new Response("bad", { status: 400 })), "tts_error");
    expectFail(await run(timeoutError()), "tts_timeout");
    expectFail(await run(answer("")), "tts_bad_output");
    expectFail(await run(jsonResponse({ candidates: [] })), "tts_bad_output");
    expectFail(await run(new Response("not json", { status: 200 })), "tts_bad_output");
  });

  it("a thrown fetch error becomes tts_error and never throws", async () => {
    const driver = createGeminiDriver(config, recordingFetch(new TypeError("fetch failed")).fetch);
    expectFail(await driver.synthesize(request()), "tts_error");
  });

  it("without a key it fails without calling the network", async () => {
    const { fetch, calls } = recordingFetch(answer());
    expectFail(await createGeminiDriver({ ...config, apiKey: null }, fetch).synthesize(request()), "tts_error");
    expect(calls).toHaveLength(0);
  });

  it("voices is the constant list and needs no call", async () => {
    const { fetch, calls } = recordingFetch(answer());
    const voices = await createGeminiDriver(config, fetch).voices();
    expect(calls).toHaveLength(0);
    expect(voices.map((v) => v.id)).toEqual(GEMINI_VOICES);
    expect(voices.length).toBeGreaterThan(10);
  });
});
