import { describe, expect, it } from "vitest";
import { FIT_VERSION, parseStoredFit, storedFitSchema, toStoredFit } from "@/lib/fit/stored";

const SCORED_AT = new Date("2026-10-11T20:30:00.000Z");
const RESULT = { score: 81, summary: "Strong match on internal tools.", pros: ["Design systems"], cons: ["No pay stated"] };

describe("toStoredFit", () => {
  it("builds a version 1 document with the model id and the time", () => {
    expect(toStoredFit(RESULT, "fake-extractor", SCORED_AT)).toEqual({
      v: 1,
      score: 81,
      summary: "Strong match on internal tools.",
      pros: ["Design systems"],
      cons: ["No pay stated"],
      modelId: "fake-extractor",
      scoredAt: "2026-10-11T20:30:00.000Z",
    });
    expect(FIT_VERSION).toBe(1);
  });

  it("builds something its own parser accepts", () => {
    const stored = toStoredFit(RESULT, "fake-extractor", SCORED_AT);
    expect(storedFitSchema.safeParse(stored).success).toBe(true);
    expect(parseStoredFit(stored)).toEqual(stored);
  });
});

describe("parseStoredFit", () => {
  const valid = toStoredFit(RESULT, "fake-extractor", SCORED_AT);

  it.each([
    ["null", null],
    ["a string", "81"],
    ["an array", []],
    ["a missing version", { ...valid, v: undefined }],
    ["a later version", { ...valid, v: 2 }],
    ["a score above 100", { ...valid, score: 101 }],
    ["a fractional score", { ...valid, score: 80.5 }],
    ["a blank summary", { ...valid, summary: "" }],
    ["a summary over 300 characters", { ...valid, summary: "x".repeat(301) }],
    ["more than three pros", { ...valid, pros: ["a", "b", "c", "d"] }],
    ["a point over 200 characters", { ...valid, cons: ["x".repeat(201)] }],
    ["a blank model id", { ...valid, modelId: "" }],
    ["a time that is not a date", { ...valid, scoredAt: "yesterday" }],
  ])("returns null for %s", (_name, raw) => {
    expect(parseStoredFit(raw)).toBeNull();
  });

  it("accepts the edges: score 0 and 100, empty lists, three points", () => {
    expect(parseStoredFit({ ...valid, score: 0, pros: [], cons: ["a", "b", "c"] })).not.toBeNull();
    expect(parseStoredFit({ ...valid, score: 100 })).not.toBeNull();
  });
});
