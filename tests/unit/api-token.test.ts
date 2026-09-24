import { describe, expect, it } from "vitest";
import { generateToken, hashToken, tokenNameSchema } from "@/lib/auth/api-token";
import { TOKEN_PATTERN } from "@/lib/bridge/wire";

describe("generateToken", () => {
  it("produces a token matching TOKEN_PATTERN, its sha256 hash, and an 8-character prefix", () => {
    const { token, hash, prefix } = generateToken();
    expect(TOKEN_PATTERN.test(token)).toBe(true);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(prefix).toBe(token.slice(0, 8));
    expect(prefix.startsWith("jsm_")).toBe(true);
  });

  it("hashToken(token) reproduces the same hash generateToken already returned", () => {
    const { token, hash } = generateToken();
    expect(hashToken(token)).toBe(hash);
  });

  it("generates 1000 distinct tokens", () => {
    const tokens = new Set(Array.from({ length: 1000 }, () => generateToken().token));
    expect(tokens.size).toBe(1000);
  });
});

describe("tokenNameSchema", () => {
  it("accepts a normal name and trims surrounding whitespace", () => {
    const result = tokenNameSchema.safeParse("  Laptop  ");
    expect(result).toMatchObject({ success: true, data: "Laptop" });
  });

  it("accepts exactly 60 characters", () => {
    expect(tokenNameSchema.safeParse("N".repeat(60)).success).toBe(true);
  });

  it.each([
    ["", "Give the token a name."],
    ["   ", "Give the token a name."],
    ["N".repeat(61), "Keep the name to 60 characters or fewer."],
  ])("rejects %j with the message %s", (input, message) => {
    const result = tokenNameSchema.safeParse(input);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toBe(message);
    }
  });
});
