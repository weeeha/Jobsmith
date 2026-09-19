import { describe, expect, it } from "vitest";
import { signUpAllowed } from "@/lib/auth/signup-gate";

describe("signUpAllowed", () => {
  it("allows sign-up when there are no users yet, regardless of the flag", () => {
    expect(signUpAllowed(0, false)).toBe(true);
    expect(signUpAllowed(0, true)).toBe(true);
  });

  it("blocks sign-up once a user exists and the flag is off", () => {
    expect(signUpAllowed(1, false)).toBe(false);
  });

  it("allows sign-up once a user exists if the flag is on", () => {
    expect(signUpAllowed(1, true)).toBe(true);
    expect(signUpAllowed(5, true)).toBe(true);
  });
});
