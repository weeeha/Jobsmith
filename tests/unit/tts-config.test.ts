import { describe, expect, it } from "vitest";
import {
  CLI_TTS_IDENTITY,
  DEFAULT_CLI_TTS_URL,
  DEFAULT_TTS_MODELS,
  parseTtsConfig,
  ttsIdentity,
} from "@/lib/tts/config";

const key = "k".repeat(24);

describe("parseTtsConfig", () => {
  it("is off when TTS_PROVIDER is unset or blank, ignoring every other TTS variable", () => {
    expect(parseTtsConfig({})).toEqual({ ok: true, config: null });
    expect(parseTtsConfig({ TTS_PROVIDER: "" })).toEqual({ ok: true, config: null });
    expect(parseTtsConfig({ GEMINI_API_KEY: key, TTS_BASE_URL: "http://x.test/v1" })).toEqual({ ok: true, config: null });
  });

  it("openai_compatible needs TTS_BASE_URL, takes an optional key and defaults the model to local", () => {
    expect(parseTtsConfig({ TTS_PROVIDER: "openai_compatible" })).toEqual({ ok: false, invalid: ["TTS_BASE_URL"] });
    expect(parseTtsConfig({ TTS_PROVIDER: "openai_compatible", TTS_BASE_URL: "http://127.0.0.1:8890/v1" })).toEqual({
      ok: true,
      config: { provider: "openai_compatible", model: "local", baseUrl: "http://127.0.0.1:8890/v1", apiKey: null },
    });
    expect(
      parseTtsConfig({ TTS_PROVIDER: "openai_compatible", TTS_BASE_URL: "https://tts.example.test/v1", TTS_API_KEY: key, TTS_MODEL: "kokoro" }),
    ).toEqual({
      ok: true,
      config: { provider: "openai_compatible", model: "kokoro", baseUrl: "https://tts.example.test/v1", apiKey: key },
    });
  });

  it("rejects a TTS_BASE_URL that is not an http or https address", () => {
    expect(parseTtsConfig({ TTS_PROVIDER: "openai_compatible", TTS_BASE_URL: "not a url" })).toEqual({
      ok: false,
      invalid: ["TTS_BASE_URL"],
    });
    expect(parseTtsConfig({ TTS_PROVIDER: "openai_compatible", TTS_BASE_URL: "ftp://x.test" })).toEqual({
      ok: false,
      invalid: ["TTS_BASE_URL"],
    });
  });

  it("gemini needs GEMINI_API_KEY and defaults the model to gemini-2.5-flash-preview-tts", () => {
    expect(parseTtsConfig({ TTS_PROVIDER: "gemini" })).toEqual({ ok: false, invalid: ["GEMINI_API_KEY"] });
    expect(parseTtsConfig({ TTS_PROVIDER: "gemini", GEMINI_API_KEY: key })).toEqual({
      ok: true,
      config: { provider: "gemini", model: "gemini-2.5-flash-preview-tts", baseUrl: null, apiKey: key },
    });
  });

  it("elevenlabs needs ELEVENLABS_API_KEY and TTS_MODEL, the spec gives no default", () => {
    expect(parseTtsConfig({ TTS_PROVIDER: "elevenlabs" })).toEqual({
      ok: false,
      invalid: ["ELEVENLABS_API_KEY", "TTS_MODEL"],
    });
    expect(parseTtsConfig({ TTS_PROVIDER: "elevenlabs", ELEVENLABS_API_KEY: key, TTS_MODEL: "eleven_flash_v2_5" })).toEqual({
      ok: true,
      config: { provider: "elevenlabs", model: "eleven_flash_v2_5", baseUrl: null, apiKey: key },
    });
  });

  it("fake needs nothing and uses model fake-tts", () => {
    expect(parseTtsConfig({ TTS_PROVIDER: "fake" })).toEqual({
      ok: true,
      config: { provider: "fake", model: "fake-tts", baseUrl: null, apiKey: null },
    });
    expect(DEFAULT_TTS_MODELS.fake).toBe("fake-tts");
  });

  it("an unknown provider and a malformed TTS_MODEL are invalid, named", () => {
    expect(parseTtsConfig({ TTS_PROVIDER: "polly" })).toEqual({ ok: false, invalid: ["TTS_PROVIDER"] });
    expect(parseTtsConfig({ TTS_PROVIDER: "fake", TTS_MODEL: "bad model!" })).toEqual({ ok: false, invalid: ["TTS_MODEL"] });
  });

  it("treats a blank TTS_MODEL as unset", () => {
    expect(parseTtsConfig({ TTS_PROVIDER: "fake", TTS_MODEL: "" })).toMatchObject({ ok: true, config: { model: "fake-tts" } });
  });
});

describe("ttsIdentity", () => {
  it("is CLI_TTS_IDENTITY when TTS is off", () => {
    expect(ttsIdentity(null)).toEqual(CLI_TTS_IDENTITY);
    expect(CLI_TTS_IDENTITY).toEqual({ provider: "openai_compatible", model: "local" });
  });

  it("is the provider and model of a config", () => {
    expect(ttsIdentity({ provider: "gemini", model: "m", baseUrl: null, apiKey: key })).toEqual({ provider: "gemini", model: "m" });
  });

  it("exports the default CLI address", () => {
    expect(DEFAULT_CLI_TTS_URL).toBe("http://127.0.0.1:8890/v1");
  });
});
