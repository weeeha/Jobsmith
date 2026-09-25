import { describe, expect, it } from "vitest";
import { KEY_PATTERN, MAX_ARTIFACTS_PER_PUSH, MAX_ARTIFACT_BYTES, MAX_PUSH_BYTES, RATE_LIMIT_PER_MINUTE, TOKEN_PATTERN } from "@/lib/bridge/wire";

describe("bridge wire limits", () => {
  it("has the exact fixed limits", () => {
    expect(MAX_ARTIFACTS_PER_PUSH).toBe(50);
    expect(MAX_ARTIFACT_BYTES).toBe(1_048_576);
    expect(MAX_PUSH_BYTES).toBe(4_194_304);
    expect(RATE_LIMIT_PER_MINUTE).toBe(120);
  });
});

describe("KEY_PATTERN", () => {
  it("accepts lowercase letters, digits, dots, dashes and underscores after a leading letter or digit", () => {
    expect(KEY_PATTERN.test("cv")).toBe(true);
    expect(KEY_PATTERN.test("call-card")).toBe(true);
    expect(KEY_PATTERN.test("answers.full")).toBe(true);
    expect(KEY_PATTERN.test("2nd-round")).toBe(true);
  });

  it("rejects an uppercase letter, a leading dash, or a value over 100 characters", () => {
    expect(KEY_PATTERN.test("CV")).toBe(false);
    expect(KEY_PATTERN.test("-cv")).toBe(false);
    expect(KEY_PATTERN.test("a".repeat(101))).toBe(false);
    expect(KEY_PATTERN.test("a".repeat(100))).toBe(true);
  });
});

describe("TOKEN_PATTERN", () => {
  it("accepts the jsm_ prefix plus 43 base64url characters", () => {
    expect(TOKEN_PATTERN.test(`jsm_${"A".repeat(43)}`)).toBe(true);
    expect(TOKEN_PATTERN.test(`jsm_${"A-b_9".repeat(8)}A-b`)).toBe(true);
  });

  it("rejects the wrong prefix, wrong length, or a disallowed character", () => {
    expect(TOKEN_PATTERN.test(`jsx_${"A".repeat(43)}`)).toBe(false);
    expect(TOKEN_PATTERN.test(`jsm_${"A".repeat(42)}`)).toBe(false);
    expect(TOKEN_PATTERN.test(`jsm_${"A".repeat(42)}!`)).toBe(false);
  });
});
