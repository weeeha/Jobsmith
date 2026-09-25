import { describe, expect, it, vi } from "vitest";
import { MockLanguageModelV4 } from "ai/test";
import { z } from "zod";

const mockModel = new MockLanguageModelV4({
  provider: "mock",
  modelId: "mock-gateway-model",
  doGenerate: async () => ({
    content: [{ type: "text", text: JSON.stringify({ companyName: "Northwind Traders", roleTitle: "Designer" }) }],
    finishReason: { unified: "stop", raw: "stop" },
    usage: { inputTokens: { total: 10, noCache: 10, cacheRead: 0, cacheWrite: 0 }, outputTokens: { total: 5, text: 5, reasoning: 0 } },
    warnings: [],
  }) as never,
});

// Replaces the real @ai-sdk/gateway module with a stand-in whose
// createGateway returns a function that always answers with mockModel,
// regardless of the model id it is asked for. This is the only way to
// observe what driverFromConfig actually sends to the model without a real
// network call.
vi.mock("@ai-sdk/gateway", () => ({
  createGateway: () => () => mockModel,
}));

const { driverFromConfig, GATEWAY_PROVIDER_OPTIONS } = await import("@/lib/ai/index");

describe("driverFromConfig: gateway", () => {
  it("names the driver gateway with the configured model id", () => {
    const driver = driverFromConfig({ provider: "gateway", model: "anthropic/claude-haiku-4.5", apiKey: undefined });
    expect(driver.name).toBe("gateway");
    expect(driver.modelId).toBe("anthropic/claude-haiku-4.5");
  });

  it("sends zeroDataRetention: true to the model call", async () => {
    const driver = driverFromConfig({ provider: "gateway", model: "anthropic/claude-haiku-4.5", apiKey: undefined });
    await driver.generate({
      task: "extract_posting",
      schema: z.object({ companyName: z.string().nullable(), roleTitle: z.string().nullable() }),
      instructions: "i",
      prompt: "<posting>\nx\n</posting>",
      maxOutputTokens: 400,
      timeoutMs: 15_000,
      userId: "u1",
    });
    const call = mockModel.doGenerateCalls.at(-1)!;
    expect(call.providerOptions).toEqual(GATEWAY_PROVIDER_OPTIONS);
  });
});

describe("driverFromConfig: fake", () => {
  it("returns the fake driver", () => {
    const driver = driverFromConfig({ provider: "fake", model: "fake-extractor" });
    expect(driver.name).toBe("fake");
    expect(driver.modelId).toBe("fake-extractor");
  });
});
