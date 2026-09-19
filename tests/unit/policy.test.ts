import { describe, expect, it } from "vitest";
import { signInMaxPerMinute } from "@/lib/auth/policy";

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
