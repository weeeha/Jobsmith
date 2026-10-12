import { describe, expect, it } from "vitest";
import { z } from "zod";
import { createFakeDriver, fakeExtractFields, fakeScoreFit, FAKE_DEFAULTS, FAKE_MODEL_ID, FAKE_SCORE_DEFAULT } from "@/lib/ai/fake";
import { AI_TASKS, type AiRequest } from "@/lib/ai/driver";
import { scoreSchema, scorePrompt, type ScoreFitInput } from "@/lib/ai/score-fit";
import { DEFAULT_PREFERENCES } from "@/lib/preferences/schema";

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

const SCORE_INPUT: ScoreFitInput = {
  posting: {
    roleTitle: "Product Designer",
    companyName: "Northwind Traders",
    location: null,
    workMode: null,
    compMin: null,
    compMax: null,
    compCurrency: null,
    bodyMd: "About the job",
  },
  headline: null,
  resumeMd: "Product designer.",
  preferences: DEFAULT_PREFERENCES,
};

function scoreRequest(prompt: string): AiRequest<unknown> {
  return {
    task: "score_fit",
    schema: scoreSchema,
    instructions: "i",
    prompt,
    maxOutputTokens: 600,
    timeoutMs: 20_000,
    userId: "u1",
  } as AiRequest<unknown>;
}

describe("fakeScoreFit", () => {
  const withPosting = (posting: string) => scorePrompt({ ...SCORE_INPUT, posting: { ...SCORE_INPUT.posting, bodyMd: posting } });

  it("scores 64 when the posting has no Fit score line", () => {
    expect(fakeScoreFit(withPosting("About the job"))).toEqual({
      score: 64,
      summary: "A test score from the fake driver.",
      pros: ["The role matches your titles."],
      cons: ["The posting does not state pay."],
    });
    expect(FAKE_SCORE_DEFAULT).toBe(64);
  });

  it("reads a Fit score line in the posting, capped at 100", () => {
    expect(fakeScoreFit(withPosting("Fit score: 81\nAbout the job"))).toMatchObject({ score: 81 });
    expect(fakeScoreFit(withPosting("About\nfit SCORE:   7  \nmore"))).toMatchObject({ score: 7 });
    expect(fakeScoreFit(withPosting("Fit score: 250"))).toMatchObject({ score: 100 });
  });

  it("fails with ai_error on Fit score: fail", () => {
    expect(fakeScoreFit(withPosting("Fit score: fail\nAbout"))).toEqual({ error: "ai_error" });
    expect(fakeScoreFit(withPosting("Fit score: FAIL"))).toEqual({ error: "ai_error" });
  });

  it("falls back to 64 for a value that is not a number or fail", () => {
    expect(fakeScoreFit(withPosting("Fit score: high"))).toMatchObject({ score: 64 });
  });

  it("ignores a Fit score line anywhere but the posting", () => {
    const prompt = scorePrompt({ ...SCORE_INPUT, resumeMd: "Fit score: 5", headline: "Fit score: 6" });
    expect(fakeScoreFit(prompt)).toMatchObject({ score: 64 });
  });
});

describe("the fake driver and score_fit", () => {
  it("has a default handler for every task", () => {
    expect(Object.keys(FAKE_DEFAULTS).sort()).toEqual([...AI_TASKS].sort());
  });

  it("scores with no handler given, instead of failing with ai_bad_output", async () => {
    const result = await createFakeDriver().generate(scoreRequest(scorePrompt(SCORE_INPUT)));
    expect(result).toMatchObject({ ok: true, data: { object: { score: 64 }, modelId: FAKE_MODEL_ID } });
  });

  it("follows a Fit score line through the driver", async () => {
    const driver = createFakeDriver();
    const prompt = scorePrompt({ ...SCORE_INPUT, posting: { ...SCORE_INPUT.posting, bodyMd: "Fit score: 81\nAbout the job" } });
    expect(await driver.generate(scoreRequest(prompt))).toMatchObject({ ok: true, data: { object: { score: 81 } } });
    const failing = scorePrompt({ ...SCORE_INPUT, posting: { ...SCORE_INPUT.posting, bodyMd: "Fit score: fail" } });
    expect(await driver.generate(scoreRequest(failing))).toEqual({ ok: false, code: "ai_error", message: "ai_error" });
  });

  it("still extracts by default for extract_posting", async () => {
    const result = await createFakeDriver().generate(baseRequest({ prompt: "<posting>\nRole: Product Designer\n</posting>" }));
    expect(result).toMatchObject({ ok: true, data: { object: { roleTitle: "Product Designer" } } });
  });

  it("lets a custom score_fit handler replace the default", async () => {
    const driver = createFakeDriver({ score_fit: () => ({ score: 10, summary: "x", pros: [], cons: [] }) });
    expect(await driver.generate(scoreRequest("<posting>\nFit score: 99\n</posting>"))).toMatchObject({ ok: true, data: { object: { score: 10 } } });
  });
});
