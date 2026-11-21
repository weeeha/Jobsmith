import { describe, expect, it } from "vitest";
import { createElevenLabsDriver } from "@/lib/tts/elevenlabs";
import type { TtsConfig } from "@/lib/tts/config";
import { bytesResponse, jsonResponse, recordingFetch, timeoutError } from "../helpers/tts-fetch";
import { expectFail, expectOk } from "../helpers/result";

const key = "k".repeat(24);
const config: TtsConfig = { provider: "elevenlabs", model: "eleven_flash_v2_5", baseUrl: null, apiKey: key };
const request = (over: Record<string, unknown> = {}) => ({
  text: "Hello there.",
  voice: "voice id/1",
  style: "default" as const,
  format: "mp3" as const,
  ...over,
});
const mp3 = () => bytesResponse([0xff, 0xfb, 0x50, 0xc0, 0, 0], "audio/mpeg");

describe("elevenlabs driver", () => {
  it("sends the documented URL, headers and body fields", async () => {
    const { fetch, calls } = recordingFetch(mp3());
    const audio = expectOk(await createElevenLabsDriver(config, fetch).synthesize(request()));
    expect(audio.contentType).toBe("audio/mpeg");
    expect(calls[0].url).toBe("https://api.elevenlabs.io/v1/text-to-speech/voice%20id%2F1?output_format=mp3_44100_64");
    expect(calls[0].method).toBe("POST");
    expect(calls[0].headers["xi-api-key"]).toBe(key);
    expect(JSON.parse(calls[0].body!)).toEqual({ text: "Hello there.", model_id: "eleven_flash_v2_5" });
  });

  it("never puts the API key in the URL", async () => {
    const { fetch, calls } = recordingFetch(mp3());
    await createElevenLabsDriver(config, fetch).synthesize(request());
    expect(calls[0].url).not.toContain(key);
  });

  it("a strict retry leaves the request unchanged, there is no style support", async () => {
    const a = recordingFetch(mp3());
    const b = recordingFetch(mp3());
    await createElevenLabsDriver(config, a.fetch).synthesize(request());
    await createElevenLabsDriver(config, b.fetch).synthesize(request({ style: "strict" }));
    expect(b.calls[0].body).toBe(a.calls[0].body);
  });

  it("maps 429, other non-2xx, timeout and an empty body", async () => {
    const run = async (a: Response | Error) => createElevenLabsDriver(config, recordingFetch(a).fetch).synthesize(request());
    expectFail(await run(new Response("slow", { status: 429 })), "tts_rate_limited");
    expectFail(await run(new Response("bad", { status: 401 })), "tts_error");
    expectFail(await run(timeoutError()), "tts_timeout");
    expectFail(await run(bytesResponse([], "audio/mpeg")), "tts_bad_output");
  });

  it("a thrown fetch error becomes tts_error and never throws", async () => {
    const driver = createElevenLabsDriver(config, recordingFetch(new TypeError("fetch failed")).fetch);
    expectFail(await driver.synthesize(request()), "tts_error");
  });

  it("voices reads voice_id and name, and is [] when the call fails", async () => {
    const ok = recordingFetch(jsonResponse({ voices: [{ voice_id: "v1", name: "Rachel", labels: { language: "en" } }, { name: "no id" }] }));
    expect(await createElevenLabsDriver(config, ok.fetch).voices()).toEqual([{ id: "v1", label: "Rachel", language: "en" }]);
    expect(ok.calls[0].url).toBe("https://api.elevenlabs.io/v1/voices");
    expect(ok.calls[0].headers["xi-api-key"]).toBe(key);
    const bad = recordingFetch(new Response("no", { status: 500 }));
    expect(await createElevenLabsDriver(config, bad.fetch).voices()).toEqual([]);
    const thrown = recordingFetch(new TypeError("down"));
    expect(await createElevenLabsDriver(config, thrown.fetch).voices()).toEqual([]);
  });
});
