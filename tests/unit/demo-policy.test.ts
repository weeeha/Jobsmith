import { describe, expect, it } from "vitest";
import {
  DEMO_MAX_ALIVE,
  DEMO_MAX_PER_MINUTE,
  demoCreationAllowed,
  demoExpiryCutoff,
  isDemoEmail,
} from "@/lib/demo/policy";
import { demoSignupKey, isDemoSignupKey } from "@/lib/demo/signup-key";

describe("isDemoEmail", () => {
  it("matches only the reserved demo domain", () => {
    expect(isDemoEmail("visitor-ab12@demo.invalid")).toBe(true);
    expect(isDemoEmail("Visitor-AB12@DEMO.INVALID")).toBe(true);
    expect(isDemoEmail("demo@example.com")).toBe(false);
    expect(isDemoEmail("someone@demo.invalid.example.com")).toBe(false);
  });
});

describe("demoExpiryCutoff", () => {
  it("is 24 hours before now", () => {
    const now = new Date("2026-11-07T12:00:00Z");
    expect(demoExpiryCutoff(now).toISOString()).toBe("2026-11-06T12:00:00.000Z");
  });
});

describe("demoCreationAllowed", () => {
  it("allows a copy while under both limits", () => {
    expect(demoCreationAllowed({ createdLastMinute: 0, alive: 0 })).toBe(true);
    expect(demoCreationAllowed({ createdLastMinute: DEMO_MAX_PER_MINUTE - 1, alive: DEMO_MAX_ALIVE - 1 })).toBe(true);
  });

  it("refuses at the per-minute limit", () => {
    expect(demoCreationAllowed({ createdLastMinute: DEMO_MAX_PER_MINUTE, alive: 0 })).toBe(false);
  });

  it("refuses at the alive limit", () => {
    expect(demoCreationAllowed({ createdLastMinute: 0, alive: DEMO_MAX_ALIVE })).toBe(false);
  });
});

describe("isDemoSignupKey", () => {
  it("accepts only this process's key", () => {
    expect(isDemoSignupKey(demoSignupKey())).toBe(true);
    expect(isDemoSignupKey("not-the-key")).toBe(false);
    expect(isDemoSignupKey("")).toBe(false);
    expect(isDemoSignupKey(null)).toBe(false);
    expect(isDemoSignupKey(undefined)).toBe(false);
  });
});
