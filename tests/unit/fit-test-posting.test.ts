import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createFakeDriver } from "@/lib/ai/fake";
import type { AiDriver } from "@/lib/ai/driver";
import { testPosting, testPostingFormSchema } from "@/lib/fit/test-posting";
import type { FitProfile } from "@/lib/fit/profile";
import type { AddJobDeps } from "@/lib/intake/deps";
import { DEFAULT_PREFERENCES, parsePreferences } from "@/lib/preferences/schema";
import { fakeGuardedFetch } from "../helpers/intake";
import { readResumeFixture } from "../helpers/profile";

const NOW = new Date("2026-10-15T09:00:00.000Z");
const USER = { userId: "user-1" };
const LINKEDIN = "https://www.linkedin.com/jobs/view/1000000001/";

function profileWith(overrides: Partial<FitProfile> = {}): FitProfile {
  return { headline: null, resumeMd: readResumeFixture(), preferences: DEFAULT_PREFERENCES, ...overrides };
}

function depsWith(ai: AiDriver | null): AddJobDeps {
  return { fetch: fakeGuardedFetch({}), ai, now: () => NOW, requestId: "request-1" };
}

function posting(lines: string[] = []): string {
  return ["Company: Northwind Labs", "Role: Design Lead", ...lines, "", "About the job", "We build internal tools."].join("\n");
}

let info: ReturnType<typeof vi.spyOn>;
let error: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  info = vi.spyOn(console, "info").mockImplementation(() => {});
  error = vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("testPostingFormSchema", () => {
  it("needs a link", () => {
    const parsed = testPostingFormSchema.safeParse({});
    expect(parsed.success).toBe(false);
    expect(parsed.error?.issues[0]).toMatchObject({ path: ["sourceUrl"], message: "Paste a link to a posting." });
  });

  it("takes only http and https links, with Add job's message", () => {
    const parsed = testPostingFormSchema.safeParse({ sourceUrl: "ftp://jobs.example.com/1" });
    expect(parsed.error?.issues[0]?.message).toBe("Enter a link that starts with http or https.");
    expect(testPostingFormSchema.safeParse({ sourceUrl: "https://jobs.example.com/1" }).success).toBe(true);
  });
});

describe("testPosting", () => {
  it("asks for the text when a link cannot be read, and logs nothing", async () => {
    const outcome = await testPosting({ url: LINKEDIN }, { ...USER, profile: profileWith() }, depsWith(createFakeDriver()));
    expect(outcome).toEqual({ kind: "needs_text", reason: "login_required" });
    expect(info).not.toHaveBeenCalled();
  });

  it("scores the pasted text of a link it could not read, and checks it against the saved hard filters", async () => {
    const preferences = parsePreferences({ titles: ["Design lead"], locations: ["Rotterdam"], workModes: ["hybrid"] });
    const outcome = await testPosting(
      { url: LINKEDIN, text: posting(["Location: Berlin, Germany", "Work mode: Hybrid", "Fit score: 64"]) },
      { ...USER, profile: profileWith({ preferences }) },
      depsWith(createFakeDriver()),
    );
    if (outcome.kind !== "result") throw new Error("expected a result");
    expect(outcome.result).toMatchObject({ roleTitle: "Design Lead", companyName: "Northwind Labs", note: null });
    expect(outcome.result.fit).toMatchObject({ score: 64, modelId: "fake-extractor", scoredAt: NOW.toISOString() });
    expect(outcome.result.band).toBe("mixed");
    expect(outcome.result.hardFilters.failed).toEqual(["location"]);
    expect(outcome.result.hardFilters.checks.map((c) => c.outcome)).toEqual(["passes", "fails", "passes", "not_set"]);
  });

  it("still checks hard filters when there is no resume, and says why it did not score", async () => {
    const driver = createFakeDriver();
    const outcome = await testPosting(
      { url: LINKEDIN, text: posting() },
      { ...USER, profile: profileWith({ resumeMd: null, preferences: parsePreferences({ titles: ["Design lead"] }) }) },
      depsWith(driver),
    );
    if (outcome.kind !== "result") throw new Error("expected a result");
    expect(outcome.result.fit).toBeNull();
    expect(outcome.result.band).toBeNull();
    expect(outcome.result.note).toBe("no_resume");
    expect(outcome.result.hardFilters.pass).toBe(true);
    expect(driver.calls.map((call) => call.task)).toEqual(["extract_posting"]);
  });

  it("with AI off, checks what it can and says AI is off", async () => {
    const outcome = await testPosting({ url: LINKEDIN, text: posting() }, { ...USER, profile: profileWith() }, depsWith(null));
    if (outcome.kind !== "result") throw new Error("expected a result");
    expect(outcome.result.fit).toBeNull();
    expect(outcome.result.note).toBe("ai_off");
  });

  it("reports a failed score as a note, not an error", async () => {
    const outcome = await testPosting(
      { url: LINKEDIN, text: posting(["Fit score: fail"]) },
      { ...USER, profile: profileWith() },
      depsWith(createFakeDriver()),
    );
    if (outcome.kind !== "result") throw new Error("expected a result");
    expect(outcome.result.fit).toBeNull();
    expect(outcome.result.note).toBe("failed");
  });

  it("falls back to Untitled posting and Unknown company in the prompt", async () => {
    const driver = createFakeDriver();
    await testPosting(
      { url: LINKEDIN, text: "About the job\nWe build internal tools.\nFit score: 70" },
      { ...USER, profile: profileWith() },
      depsWith(driver),
    );
    const scoring = driver.calls.find((call) => call.task === "score_fit");
    expect(scoring?.prompt).toContain("Role: Untitled posting");
    expect(scoring?.prompt).toContain("Company: Unknown company");
  });

  it("scores against the saved resume, headline and preferences it was given", async () => {
    const driver = createFakeDriver();
    await testPosting(
      { url: LINKEDIN, text: posting() },
      { ...USER, profile: profileWith({ headline: "Product designer", preferences: parsePreferences({ dealbreakers: ["On-call rotation"] }) }) },
      depsWith(driver),
    );
    const prompt = driver.calls.find((call) => call.task === "score_fit")?.prompt ?? "";
    expect(prompt).toContain("Product designer with eight years");
    expect(prompt).toContain("Dealbreakers: On-call rotation");
  });

  it("logs one test line with the model and no text", async () => {
    await testPosting(
      { url: LINKEDIN, text: posting(["Fit score: 81"]) },
      { ...USER, profile: profileWith({ headline: "SECRET-HEADLINE" }) },
      depsWith(createFakeDriver()),
    );
    expect(info).toHaveBeenCalledTimes(1);
    const [tag, json] = info.mock.calls[0] as [string, string];
    expect(tag).toBe("[fit]");
    expect(JSON.parse(json)).toEqual({
      opportunityId: null,
      outcome: "test",
      reason: null,
      modelId: "fake-extractor",
      ms: 0,
      inputTokens: null,
      outputTokens: null,
    });
    expect(json).not.toContain("Northwind");
    expect(json).not.toContain("SECRET");
    expect(error).not.toHaveBeenCalled();
  });
});
