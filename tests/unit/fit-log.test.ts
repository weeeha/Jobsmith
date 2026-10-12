import { afterEach, describe, expect, it, vi } from "vitest";
import { DrizzleQueryError } from "drizzle-orm";
import { logFit } from "@/lib/fit/log";
import { logDbErrorSafely } from "@/lib/log/db-error";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("logFit", () => {
  it("writes one [fit] line holding exactly the fields it was given", () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    logFit({
      opportunityId: "00000000-0000-4000-8000-000000000001",
      outcome: "done",
      reason: null,
      modelId: "fake-extractor",
      ms: 12,
      inputTokens: 100,
      outputTokens: 40,
    });
    expect(info).toHaveBeenCalledTimes(1);
    const [tag, body] = info.mock.calls[0] as [string, string];
    expect(tag).toBe("[fit]");
    expect(JSON.parse(body)).toEqual({
      opportunityId: "00000000-0000-4000-8000-000000000001",
      outcome: "done",
      reason: null,
      modelId: "fake-extractor",
      ms: 12,
      inputTokens: 100,
      outputTokens: 40,
    });
  });
});

describe("logDbErrorSafely with the fit tag", () => {
  it("logs a plain error by constructor name only, never its message", () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    logDbErrorSafely("[fit]", {}, new TypeError("SECRET-RESUME-TEXT"));
    expect(error).toHaveBeenCalledTimes(1);
    const [tag, body] = error.mock.calls[0] as [string, string];
    expect(tag).toBe("[fit]");
    expect(JSON.parse(body)).toEqual({ error: "TypeError" });
    expect(JSON.stringify(error.mock.calls)).not.toContain("SECRET");
  });

  it("logs a Drizzle error by name, Postgres code and constraint, never the SQL or its parameters", () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const cause = Object.assign(new Error("duplicate key value SECRET-RESUME-TEXT"), { code: "23505", constraint: "opportunity_fit_score_check" });
    logDbErrorSafely("[fit]", {}, new DrizzleQueryError('update "opportunity" set "fit" = $1 -- SECRET-RESUME-TEXT', ["SECRET-RESUME-TEXT"], cause));
    const [, body] = error.mock.calls[0] as [string, string];
    expect(JSON.parse(body)).toEqual({ error: "DrizzleQueryError", code: "23505", constraint: "opportunity_fit_score_check" });
    expect(JSON.stringify(error.mock.calls)).not.toContain("SECRET");
  });

  it("logs a thrown non-error as UnknownError", () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    logDbErrorSafely("[fit]", {}, "SECRET-RESUME-TEXT");
    const [, body] = error.mock.calls[0] as [string, string];
    expect(JSON.parse(body)).toEqual({ error: "UnknownError" });
  });
});
