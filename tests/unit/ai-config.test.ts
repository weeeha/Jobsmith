import { describe, expect, it } from "vitest";
import { parseAiConfig } from "@/lib/ai/config";

describe("parseAiConfig", () => {
  it("gives config: null when AI_PROVIDER is unset", () => {
    expect(parseAiConfig({})).toEqual({ ok: true, config: null });
  });

  it("gives config: null when AI_PROVIDER is blank, ignoring every other AI variable", () => {
    expect(parseAiConfig({ AI_PROVIDER: "", ANTHROPIC_API_KEY: "k".repeat(24) })).toEqual({ ok: true, config: null });
  });

  it("rejects an unknown AI_PROVIDER value", () => {
    expect(parseAiConfig({ AI_PROVIDER: "openai" })).toEqual({ ok: false, invalid: ["AI_PROVIDER"] });
  });

  it("requires AI_GATEWAY_API_KEY for gateway, unless VERCEL=1", () => {
    expect(parseAiConfig({ AI_PROVIDER: "gateway" })).toEqual({ ok: false, invalid: ["AI_GATEWAY_API_KEY"] });
    expect(parseAiConfig({ AI_PROVIDER: "gateway", VERCEL: "1" })).toEqual({
      ok: true,
      config: { provider: "gateway", model: "anthropic/claude-haiku-4.5", apiKey: undefined },
    });
  });

  it("accepts gateway with a key, using the default model", () => {
    const key = "k".repeat(24);
    expect(parseAiConfig({ AI_PROVIDER: "gateway", AI_GATEWAY_API_KEY: key })).toEqual({
      ok: true,
      config: { provider: "gateway", model: "anthropic/claude-haiku-4.5", apiKey: key },
    });
  });

  it("requires ANTHROPIC_API_KEY for anthropic", () => {
    expect(parseAiConfig({ AI_PROVIDER: "anthropic" })).toEqual({ ok: false, invalid: ["ANTHROPIC_API_KEY"] });
  });

  it("accepts anthropic with a key, using the default model", () => {
    const key = "k".repeat(24);
    expect(parseAiConfig({ AI_PROVIDER: "anthropic", ANTHROPIC_API_KEY: key })).toEqual({
      ok: true,
      config: { provider: "anthropic", model: "claude-haiku-4-5-20251001", apiKey: key },
    });
  });

  it("accepts fake with no key needed", () => {
    expect(parseAiConfig({ AI_PROVIDER: "fake" })).toEqual({ ok: true, config: { provider: "fake", model: "fake-extractor" } });
  });

  it("rejects an AI_MODEL that does not match the allowed pattern", () => {
    expect(parseAiConfig({ AI_PROVIDER: "fake", AI_MODEL: "bad model!" })).toEqual({ ok: false, invalid: ["AI_MODEL"] });
  });

  it("uses a valid AI_MODEL override in place of the provider's default", () => {
    expect(parseAiConfig({ AI_PROVIDER: "fake", AI_MODEL: "custom-model" })).toEqual({
      ok: true,
      config: { provider: "fake", model: "custom-model" },
    });
  });

  // Mutation target: without the AI_PROVIDER-unset guard running first, this
  // would fall through into the provider-name check, which rejects
  // `undefined` as an unknown AI_PROVIDER value instead of returning null.
  it("gives config: null for ANTHROPIC_API_KEY alone, with no AI_PROVIDER set", () => {
    expect(parseAiConfig({ ANTHROPIC_API_KEY: "k".repeat(24) })).toEqual({ ok: true, config: null });
  });
});
