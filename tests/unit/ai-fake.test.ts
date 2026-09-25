import { describe, expect, it } from "vitest";
import { z } from "zod";
import { createFakeDriver, fakeExtractFields, FAKE_MODEL_ID } from "@/lib/ai/fake";
import type { AiRequest } from "@/lib/ai/driver";

const postingSchema = z.object({
  companyName: z.string().nullable(),
  roleTitle: z.string().nullable(),
  location: z.string().nullable(),
  workMode: z.string().nullable(),
  compMin: z.number().nullable(),
  compMax: z.number().nullable(),
  compCurrency: z.string().nullable(),
});

function baseRequest(overrides: Partial<AiRequest<unknown>> = {}): AiRequest<unknown> {
  return {
    task: "extract_posting",
    schema: postingSchema,
    instructions: "i",
    prompt: "<posting>\nAbout the job\n</posting>",
    maxOutputTokens: 400,
    timeoutMs: 15_000,
    userId: "u1",
    ...overrides,
  } as AiRequest<unknown>;
}

describe("fakeExtractFields", () => {
  it("reads Company, Role, Location and Work mode lines, case-insensitively, first match each", () => {
    expect(
      fakeExtractFields(
        "<posting>\nCompany: Northwind Traders\nRole: Product Designer\nLocation: Rotterdam\nWork mode: Hybrid\n\nAbout the job\n</posting>",
      ),
    ).toEqual({
      companyName: "Northwind Traders",
      roleTitle: "Product Designer",
      location: "Rotterdam",
      workMode: "hybrid",
      compMin: null,
      compMax: null,
      compCurrency: null,
    });
  });

  it("returns every field null when no labeled lines are present", () => {
    expect(fakeExtractFields("<posting>\nAbout the job\n</posting>")).toEqual({
      companyName: null,
      roleTitle: null,
      location: null,
      workMode: null,
      compMin: null,
      compMax: null,
      compCurrency: null,
    });
  });
});

describe("createFakeDriver", () => {
  it("runs fakeExtractFields as the default handler, with modelId fake-extractor and null usage", async () => {
    const driver = createFakeDriver();
    const result = await driver.generate(
      baseRequest({ prompt: "<posting>\nCompany: Northwind Traders\nRole: Product Designer\n</posting>" }),
    );
    expect(result).toEqual({
      ok: true,
      data: {
        object: {
          companyName: "Northwind Traders",
          roleTitle: "Product Designer",
          location: null,
          workMode: null,
          compMin: null,
          compMax: null,
          compCurrency: null,
        },
        modelId: FAKE_MODEL_ID,
        usage: { inputTokens: null, outputTokens: null },
      },
    });
  });

  it("records every request it receives", async () => {
    const driver = createFakeDriver();
    await driver.generate(baseRequest());
    await driver.generate(baseRequest());
    expect(driver.calls).toHaveLength(2);
  });

  it("a custom handler can return an error result, which fails with that code", async () => {
    const driver = createFakeDriver({ extract_posting: () => ({ error: "ai_timeout" }) });
    const result = await driver.generate(baseRequest());
    expect(result).toEqual({ ok: false, code: "ai_timeout", message: "ai_timeout" });
  });

  it("a handler's output that fails the request's own schema gives ai_bad_output", async () => {
    const driver = createFakeDriver({ extract_posting: () => ({ workMode: "not-a-real-mode" }) });
    const strictSchema = z.object({ workMode: z.enum(["remote", "hybrid", "onsite"]) });
    const result = await driver.generate(baseRequest({ schema: strictSchema }));
    expect(result).toEqual({ ok: false, code: "ai_bad_output", message: "ai_bad_output" });
  });
});
