import { describe, expect, it } from "vitest";
import { signInMaxPerMinute, signInRateLimitRule } from "@/lib/auth/policy";

describe("signInMaxPerMinute", () => {
  it("defaults to 5 when the variable is absent", () => {
    expect(signInMaxPerMinute({})).toBe(5);
  });

  it("uses a whole number of 1 or more", () => {
    expect(signInMaxPerMinute({ AUTH_SIGNIN_MAX_PER_MINUTE: "1" })).toBe(1);
    expect(signInMaxPerMinute({ AUTH_SIGNIN_MAX_PER_MINUTE: "1000" })).toBe(1000);
  });

  it("falls back to 5 for anything else", () => {
    for (const value of ["0", "-3", "2.5", "many", ""]) {
      expect(signInMaxPerMinute({ AUTH_SIGNIN_MAX_PER_MINUTE: value })).toBe(5);
    }
  });
});

describe("signInRateLimitRule", () => {
  it("uses the configured per-minute limit when the request has a client address", () => {
    expect(signInRateLimitRule(true, {})).toEqual({ window: 60, max: 5 });
    expect(signInRateLimitRule(true, { AUTH_SIGNIN_MAX_PER_MINUTE: "2" })).toEqual({
      window: 60,
      max: 2,
    });
  });

  it("raises the limit to at least 30 when the request has no client address", () => {
    // Without a reverse proxy there is no x-forwarded-for header, so every
    // visitor shares one bucket; at the configured default of 5, six failed
    // sign-ins from anywhere would lock out every visitor, including the
    // owner, for a minute.
    expect(signInRateLimitRule(false, {})).toEqual({ window: 60, max: 30 });
    expect(signInRateLimitRule(false, { AUTH_SIGNIN_MAX_PER_MINUTE: "2" })).toEqual({
      window: 60,
      max: 30,
    });
  });

  it("never lowers a configured limit that is already 30 or above, even with no client address", () => {
    expect(signInRateLimitRule(false, { AUTH_SIGNIN_MAX_PER_MINUTE: "1000" })).toEqual({
      window: 60,
      max: 1000,
    });
  });
});
