import { describe, expect, it } from "vitest";
import { fitBand, FIT_BAND_WORDS, MIXED_BAND_WIDTH } from "@/lib/fit/bands";

describe("fitBand", () => {
  it.each([
    [100, 70, "good"],
    [70, 70, "good"],
    [69, 70, "mixed"],
    [55, 70, "mixed"],
    [54, 70, "weak"],
    [0, 70, "weak"],
    [40, 40, "good"],
    [25, 40, "mixed"],
    [24, 40, "weak"],
    [0, 0, "good"],
  ] as const)("scores %i against a threshold of %i as %s", (score, threshold, band) => {
    expect(fitBand(score, threshold)).toBe(band);
  });

  it("keeps the mixed band 15 points wide, as the drafts propose", () => {
    expect(MIXED_BAND_WIDTH).toBe(15);
  });

  it("names each band with the drafts' words", () => {
    expect(FIT_BAND_WORDS).toEqual({ good: "Good fit", mixed: "Mixed", weak: "Weak fit" });
  });
});
