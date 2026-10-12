import { describe, expect, it } from "vitest";
import { FIT_BANDS, FIT_BAND_WORDS, PARTIAL_FIT_FROM, STRONG_FIT_FROM, fitBand } from "@/lib/fit/bands";

describe("fitBand", () => {
  it.each([
    [0, "weak"],
    [39, "weak"],
    [40, "partial"],
    [69, "partial"],
    [70, "strong"],
    [100, "strong"],
  ] as const)("%i is %s", (score, band) => {
    expect(fitBand(score)).toBe(band);
  });

  it("keeps the thresholds in one place", () => {
    expect(STRONG_FIT_FROM).toBe(70);
    expect(PARTIAL_FIT_FROM).toBe(40);
    expect(FIT_BANDS).toEqual(["strong", "partial", "weak"]);
  });

  it("has a word for each band", () => {
    expect(FIT_BAND_WORDS).toEqual({ strong: "strong fit", partial: "partial fit", weak: "weak fit" });
  });
});
