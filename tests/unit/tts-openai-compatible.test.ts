import { describe, expect, it } from "vitest";
import { createOpenAiCompatibleDriver } from "@/lib/tts/openai-compatible";
import type { TtsConfig } from "@/lib/tts/config";
import { STRICT_INSTRUCTION } from "@/lib/tts/driver";
import { bytesResponse, jsonResponse, recordingFetch, timeoutError } from "../helpers/tts-fetch";
import { expectFail, expectOk } from "../helpers/result";

const key = "k".repeat(24);
const config = (over: Partial<TtsConfig> = {}): TtsConfig => ({
  provider: "openai_compatible",
  model: "local",
  baseUrl: "http://127.0.0.1:8890/v1",
  apiKey: null,
  ...over,
});
const request = (over: Record<string, unknown> = {}) => ({
  text: "Hello there.",
  voice: "Vivian",
  style: "default" as const,
  format: "mp3" as const,
  ...over,
});
const mp3 = () => bytesResponse([0xff, 0xfb, 0x50, 0xc0, 0, 0], "audio/mpeg");

describe("openai_compatible driver", () => {
  it("sends the documented URL, headers and body fields", async () => {
    const { fetch, calls } = recordingFetch(mp3());
    const driver = createOpenAiCompatibleDriver(config({ apiKey: key }), fetch);
    const audio = expectOk(await driver.synthesize(request()));
    expect(audio.contentType).toBe("audio/mpeg");
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe("http://127.0.0.1:8890/v1/audio/speech");
    expect(calls[0].method).toBe("POST");
    expect(calls[0].headers["content-type"]).toBe("application/json");
    expect(calls[0].headers.authorization).toBe(`Bearer ${key}`);
    expect(JSON.parse(calls[0].body!)).toEqual({ model: "local", input: "Hello there.", voice: "Vivian", response_format: "mp3" });
  });

  it("sends no Authorization header without a key, and never puts the key in the URL", async () => {
    const without = recordingFetch(mp3());
    await createOpenAiCompatibleDriver(config(), without.fetch).synthesize(request());
    expect(without.calls[0].headers.authorization).toBeUndefined();
    const withKey = recordingFetch(mp3());
    await createOpenAiCompatibleDriver(config({ apiKey: key }), withKey.fetch).synthesize(request());
    expect(withKey.calls[0].url).not.toContain(key);
  });

  it("trailing slashes on TTS_BASE_URL do not double up", async () => {
    const { fetch, calls } = recordingFetch(mp3());
    await createOpenAiCompatibleDriver(config({ baseUrl: "http://127.0.0.1:8890/v1///" }), fetch).synthesize(request());
    expect(calls[0].url).toBe("http://127.0.0.1:8890/v1/audio/speech");
  });

  it("a strict retry adds the instruction", async () => {
    const { fetch, calls } = recordingFetch(mp3());
    await createOpenAiCompatibleDriver(config(), fetch).synthesize(request({ style: "strict" }));
    expect(JSON.parse(calls[0].body!).instructions).toBe(STRICT_INSTRUCTION);
    const plain = recordingFetch(mp3());
    await createOpenAiCompatibleDriver(config(), plain.fetch).synthesize(request());
    expect(JSON.parse(plain.calls[0].body!)).not.toHaveProperty("instructions");
  });

  it("asks for the requested format and returns whatever content type answers", async () => {
    const wav = recordingFetch(bytesResponse([1, 2, 3, 4], "audio/wav"));
    const driver = createOpenAiCompatibleDriver(config(), wav.fetch);
    expect(expectOk(await driver.synthesize(request({ format: "wav" }))).contentType).toBe("audio/wav");
    expect(JSON.parse(wav.calls[0].body!).response_format).toBe("wav");
    const mpeg = recordingFetch(mp3());
    expect(expectOk(await createOpenAiCompatibleDriver(config(), mpeg.fetch).synthesize(request())).contentType).toBe("audio/mpeg");
  });

  it("maps 429 to tts_rate_limited, other non-2xx to tts_error, a timeout to tts_timeout, an empty body to tts_bad_output", async () => {
    const run = async (answer: Response | Error) =>
      createOpenAiCompatibleDriver(config(), recordingFetch(answer).fetch).synthesize(request());
    expectFail(await run(new Response("slow down", { status: 429 })), "tts_rate_limited");
    expectFail(await run(new Response("nope", { status: 500 })), "tts_error");
    expectFail(await run(timeoutError()), "tts_timeout");
    expectFail(await run(bytesResponse([], "audio/mpeg")), "tts_bad_output");
  });

  it("a thrown fetch error becomes tts_error and never throws out of synthesize", async () => {
    const driver = createOpenAiCompatibleDriver(config(), recordingFetch(new TypeError("fetch failed")).fetch);
    expectFail(await driver.synthesize(request()), "tts_error");
  });

  it("voices tries /audio/voices first and accepts an array of strings", async () => {
    const { fetch, calls } = recordingFetch(jsonResponse(["Vivian", "Ryan"]));
    const voices = await createOpenAiCompatibleDriver(config(), fetch).voices();
    expect(calls.map((c) => c.url)).toEqual(["http://127.0.0.1:8890/v1/audio/voices"]);
    expect(voices).toEqual([
      { id: "Vivian", label: "Vivian", language: null },
      { id: "Ryan", label: "Ryan", language: null },
    ]);
  });

  it("voices falls back to /voices and accepts { voices: [...] } of objects with id or name", async () => {
    const { fetch, calls } = recordingFetch(
      new Response("no", { status: 404 }),
      jsonResponse({ voices: [{ id: "a1", name: "Alba", language: "en" }, { name: "Only" }, 7, null] }),
    );
    const voices = await createOpenAiCompatibleDriver(config(), fetch).voices();
    expect(calls.map((c) => c.url)).toEqual(["http://127.0.0.1:8890/v1/audio/voices", "http://127.0.0.1:8890/v1/voices"]);
    expect(voices).toEqual([
      { id: "a1", label: "Alba", language: "en" },
      { id: "Only", label: "Only", language: null },
    ]);
  });

  it("voices is [] when neither endpoint answers", async () => {
    const both404 = recordingFetch(new Response("no", { status: 404 }));
    expect(await createOpenAiCompatibleDriver(config(), both404.fetch).voices()).toEqual([]);
    const thrown = recordingFetch(new TypeError("down"));
    expect(await createOpenAiCompatibleDriver(config(), thrown.fetch).voices()).toEqual([]);
  });
});
