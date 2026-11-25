import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { normalizeQuestion, questionKey } from "@/lib/prep/question-key";
import { WARNING_MARKER } from "@/lib/prep/values";

describe("normalizeQuestion", () => {
  it("lower-cases and strips straight and curly quotes, punctuation and the warning marker", () => {
    expect(normalizeQuestion(`"Tell me about yourself" ${WARNING_MARKER}`)).toBe("tell me about yourself");
    expect(normalizeQuestion("“Why us?”, he said; ‘really’!")).toBe("why us he said really");
  });

  it("collapses repeated whitespace and trims", () => {
    expect(normalizeQuestion("  Tell   me \t about\n you  ")).toBe("tell me about you");
  });
});

describe("questionKey", () => {
  it("treats 'Why us?' and 'why  us' as one key", () => {
    expect(questionKey("Why us?")).toBe(questionKey("why  us"));
  });

  it("returns 16 lower-case hex characters equal to sha256 computed in the test", () => {
    const key = questionKey("Tell me about yourself");
    expect(key).toMatch(/^[0-9a-f]{16}$/);
    const expected = createHash("sha256").update("tell me about yourself").digest("hex").slice(0, 16);
    expect(key).toBe(expected);
  });

  it("two different questions give different keys", () => {
    expect(questionKey("Why us?")).not.toBe(questionKey("Why you?"));
  });
});
