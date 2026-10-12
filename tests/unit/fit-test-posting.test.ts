import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createFakeDriver } from "@/lib/ai/fake";
import type { AiDriver } from "@/lib/ai/driver";
import { testPosting } from "@/lib/fit/test-posting";
import type { AddJobDeps } from "@/lib/intake/deps";
import { DEFAULT_PREFERENCES, parsePreferences } from "@/lib/preferences/schema";
import type { ProfileView } from "@/lib/profile/store";
import { fakeGuardedFetch } from "../helpers/intake";
import { readResumeFixture } from "../helpers/profile";

const NOW = new Date("2026-10-11T20:30:00.000Z");
const USER = { userId: "user-1" };

function profileWith(overrides: Partial<ProfileView> = {}): ProfileView {
  return {
    headline: null,
    resumeMd: readResumeFixture(),
    timezone: "UTC",
    preferences: DEFAULT_PREFERENCES,
    updatedAt: null,
    ...overrides,
  };
}

function depsWith(ai: AiDriver | null): AddJobDeps {
  return { fetch: fakeGuardedFetch({}), ai, now: () => NOW, requestId: "request-1" };
}

function posting(lines: string[] = []): string {
  return ["Company: Northwind Traders", "Role: Product Designer", ...lines, "", "About the job", "We build internal tools."].join("\n");
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

describe("testPosting", () => {
  it("asks for the text when a link cannot be read", async () => {
    const outcome = await testPosting(
      { url: "https://www.linkedin.com/jobs/view/1000000001/" },
      { ...USER, profile: profileWith() },
      depsWith(createFakeDriver()),
    );
    expect(outcome).toEqual({ kind: "needs_text", reason: "login_required" });
    expect(info).not.toHaveBeenCalled();
  });

  it("scores a pasted posting and checks it against the saved hard filters", async () => {
    const preferences = parsePreferences({ titles: ["Product Designer"], locations: ["Berlin"] });
    const outcome = await testPosting(
      { text: posting(["Location: Amsterdam", "Fit score: 81"]) },
      { ...USER, profile: profileWith({ preferences }) },
      depsWith(createFakeDriver()),
    );
    expect(outcome.kind).toBe("result");
    if (outcome.kind !== "result") return;
    expect(outcome.result.roleTitle).toBe("Product Designer");
    expect(outcome.result.companyName).toBe("Northwind Traders");
    expect(outcome.result.fit?.score).toBe(81);
    expect(outcome.result.note).toBeNull();
    expect(outcome.result.hardFilters).toEqual({ pass: false, failed: ["location"], unchecked: [] });
  });

  it("still checks hard filters when there is no resume, and says why it did not score", async () => {
    const driver = createFakeDriver();
    const preferences = parsePreferences({ titles: ["Product Designer"] });
    const outcome = await testPosting(
      { text: posting() },
      { ...USER, profile: profileWith({ resumeMd: null, preferences }) },
      depsWith(driver),
    );
    if (outcome.kind !== "result") throw new Error("expected a result");
    expect(outcome.result.fit).toBeNull();
    expect(outcome.result.note).toBe("no_resume");
    expect(outcome.result.hardFilters.pass).toBe(true);
    expect(driver.calls.map((call) => call.task)).toEqual(["extract_posting"]);
  });

  it("with AI off, checks what it can and says AI is off", async () => {
    const outcome = await testPosting({ text: posting() }, { ...USER, profile: profileWith() }, depsWith(null));
    if (outcome.kind !== "result") throw new Error("expected a result");
    expect(outcome.result.fit).toBeNull();
    expect(outcome.result.note).toBe("ai_off");
  });

  it("reports a failed score as a note, not an error", async () => {
    const outcome = await testPosting(
      { text: posting(["Fit score: fail"]) },
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
      { text: "About the job\nWe build internal tools.\nFit score: 70" },
      { ...USER, profile: profileWith() },
      depsWith(driver),
    );
    const scoring = driver.calls.find((call) => call.task === "score_fit");
    expect(scoring?.prompt).toContain("Role: Untitled posting");
    expect(scoring?.prompt).toContain("Company: Unknown company");
  });

  it("scores against the saved resume and preferences it was given", async () => {
    const driver = createFakeDriver();
    const preferences = parsePreferences({ dealbreakers: ["On-call rotation"] });
    await testPosting(
      { text: posting() },
      { ...USER, profile: profileWith({ headline: "Product designer", preferences }) },
      depsWith(driver),
    );
    const prompt = driver.calls.find((call) => call.task === "score_fit")?.prompt ?? "";
    expect(prompt).toContain("Product designer with eight years");
    expect(prompt).toContain("Dealbreakers: On-call rotation");
  });

  it("logs one test line with the model and no text", async () => {
    await testPosting(
      { text: posting(["Fit score: 81"]) },
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
