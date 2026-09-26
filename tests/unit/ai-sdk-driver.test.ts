import { describe, expect, it } from "vitest";
import { MockLanguageModelV4 } from "ai/test";
import { z } from "zod";
import { createSdkDriver } from "@/lib/ai/sdk-driver";
import type { AiRequest } from "@/lib/ai/driver";

function usage(input: number, output: number) {
  return {
    inputTokens: { total: input, noCache: input, cacheRead: 0, cacheWrite: 0 },
    outputTokens: { total: output, text: output, reasoning: 0 },
  };
}

const schema = z.object({ companyName: z.string().nullable(), roleTitle: z.string().nullable() });
const goodJson = JSON.stringify({ companyName: "Northwind Traders", roleTitle: "Product Designer" });

function baseRequest(overrides: Partial<AiRequest<unknown>> = {}): AiRequest<unknown> {
  return {
    task: "extract_posting",
    schema,
    instructions: "i",
    prompt: "<posting>\nx\n</posting>",
    maxOutputTokens: 400,
    timeoutMs: 15_000,
    // Never asserted to reach the model below by design: this is the
    // literal that "the user id never appears in the call" checks for.
    userId: "user-should-never-appear",
    ...overrides,
  } as AiRequest<unknown>;
}

describe("createSdkDriver", () => {
  it("returns ok with the parsed object, modelId and usage numbers", async () => {
    const mock = new MockLanguageModelV4({
      provider: "mock",
      modelId: "m",
      doGenerate: async () => ({
        content: [{ type: "text", text: goodJson }],
        finishReason: { unified: "stop", raw: "stop" },
        usage: usage(10, 5),
        warnings: [],
      }) as never,
    });
    const driver = createSdkDriver({ name: "gateway", model: mock, modelId: "anthropic/claude-haiku-4.5" });
    const result = await driver.generate(baseRequest());
    expect(result).toEqual({
      ok: true,
      data: {
        object: { companyName: "Northwind Traders", roleTitle: "Product Designer" },
        modelId: "anthropic/claude-haiku-4.5",
        usage: { inputTokens: 10, outputTokens: 5 },
      },
    });
  });

  it("passes providerOptions and maxOutputTokens through to the model call, and never sends userId", async () => {
    const mock = new MockLanguageModelV4({
      provider: "mock",
      modelId: "m",
      doGenerate: async () => ({
        content: [{ type: "text", text: goodJson }],
        finishReason: { unified: "stop", raw: "stop" },
        usage: usage(10, 5),
        warnings: [],
      }) as never,
    });
    const driver = createSdkDriver({
      name: "gateway",
      model: mock,
      modelId: "m",
      providerOptions: { gateway: { zeroDataRetention: true } },
    });
    await driver.generate(baseRequest());
    const call = mock.doGenerateCalls[0]!;
    expect(call.providerOptions).toEqual({ gateway: { zeroDataRetention: true } });
    expect(call.maxOutputTokens).toBe(400);
    expect(JSON.stringify(call)).not.toContain("user-should-never-appear");
  });

  it("gives ai_bad_output when the reply is missing a required key", async () => {
    const mock = new MockLanguageModelV4({
      provider: "mock",
      modelId: "m",
      doGenerate: async () => ({
        content: [{ type: "text", text: JSON.stringify({ companyName: "X" }) }],
        finishReason: { unified: "stop", raw: "stop" },
        usage: usage(1, 1),
        warnings: [],
      }) as never,
    });
    const required = z.object({ companyName: z.string().nullable(), roleTitle: z.string().nullable() });
    const driver = createSdkDriver({ name: "gateway", model: mock, modelId: "m" });
    const result = await driver.generate(baseRequest({ schema: required }));
    expect(result).toEqual({ ok: false, code: "ai_bad_output", message: "ai_bad_output" });
  });

  it("gives ai_bad_output when the reply is not JSON", async () => {
    const mock = new MockLanguageModelV4({
      provider: "mock",
      modelId: "m",
      doGenerate: async () => ({
        content: [{ type: "text", text: "I cannot help with that." }],
        finishReason: { unified: "stop", raw: "stop" },
        usage: usage(1, 1),
        warnings: [],
      }) as never,
    });
    const driver = createSdkDriver({ name: "gateway", model: mock, modelId: "m" });
    const result = await driver.generate(baseRequest());
    expect(result).toEqual({ ok: false, code: "ai_bad_output", message: "ai_bad_output" });
  });

  it("gives ai_bad_output when the reply uses a value outside the schema's enum", async () => {
    const mock = new MockLanguageModelV4({
      provider: "mock",
      modelId: "m",
      doGenerate: async () => ({
        content: [{ type: "text", text: JSON.stringify({ workMode: "office" }) }],
        finishReason: { unified: "stop", raw: "stop" },
        usage: usage(1, 1),
        warnings: [],
      }) as never,
    });
    const enumSchema = z.object({ workMode: z.enum(["remote", "hybrid", "onsite"]) });
    const driver = createSdkDriver({ name: "gateway", model: mock, modelId: "m" });
    const result = await driver.generate(baseRequest({ schema: enumSchema }));
    expect(result).toEqual({ ok: false, code: "ai_bad_output", message: "ai_bad_output" });
  });

  it("gives ai_timeout when the model outlasts timeoutMs", async () => {
    const mock = new MockLanguageModelV4({
      provider: "mock",
      modelId: "m",
      doGenerate: async (opts) => {
        await new Promise<void>((resolve, reject) => {
          const timer = setTimeout(resolve, 500);
          opts.abortSignal?.addEventListener("abort", () => {
            clearTimeout(timer);
            reject(opts.abortSignal?.reason ?? new Error("aborted"));
          });
        });
        return {
          content: [{ type: "text", text: goodJson }],
          finishReason: { unified: "stop", raw: "stop" },
          usage: usage(1, 1),
          warnings: [],
        } as never;
      },
    });
    const driver = createSdkDriver({ name: "gateway", model: mock, modelId: "m" });
    const result = await driver.generate(baseRequest({ timeoutMs: 50 }));
    expect(result).toEqual({ ok: false, code: "ai_timeout", message: "ai_timeout" });
  });

  it("gives ai_error when the provider throws", async () => {
    const mock = new MockLanguageModelV4({
      provider: "mock",
      modelId: "m",
      doGenerate: async () => {
        throw new Error("provider blew up");
      },
    });
    const driver = createSdkDriver({ name: "gateway", model: mock, modelId: "m" });
    const result = await driver.generate(baseRequest());
    expect(result).toEqual({ ok: false, code: "ai_error", message: "ai_error" });
  });
});
