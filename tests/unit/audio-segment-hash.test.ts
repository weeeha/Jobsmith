import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { segmentHash } from "@/lib/audio/segments";

const base = { provider: "fake", model: "fake-tts", voice: "Vivian", style: "v1", spokenText: "Hello there." };
const expected = (i: typeof base) =>
  createHash("sha256").update(`${i.provider} | ${i.model} | ${i.voice} | ${i.style} | ${i.spokenText}`).digest("hex").slice(0, 16);

describe("segmentHash", () => {
  it("is the first 16 hex of sha256 over 'provider | model | voice | style | spokenText'", () => {
    const hash = segmentHash(base);
    expect(hash).toMatch(/^[0-9a-f]{16}$/);
    expect(hash).toBe(expected(base));
  });

  it("any one field changing changes the hash; the question number and the job never enter it", () => {
    const seen = new Set([segmentHash(base)]);
    for (const change of [{ provider: "gemini" }, { model: "m2" }, { voice: "Ryan" }, { style: "v2" }, { spokenText: "Hello there!" }]) {
      seen.add(segmentHash({ ...base, ...change }));
    }
    expect(seen.size).toBe(6);
    // The input type has no room for a question number or a job, and extra
    // keys do not change the result.
    expect(segmentHash({ ...base, number: 7, opportunityId: "job" } as typeof base)).toBe(segmentHash(base));
  });
});
