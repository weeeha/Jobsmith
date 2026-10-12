// The score bands, in one place. The chip, its screen-reader text and the fit
// card all read them from here.
export const FIT_BANDS = ["strong", "partial", "weak"] as const;
export type FitBand = (typeof FIT_BANDS)[number];

export const STRONG_FIT_FROM = 70;
export const PARTIAL_FIT_FROM = 40;

export function fitBand(score: number): FitBand {
  if (score >= STRONG_FIT_FROM) return "strong";
  if (score >= PARTIAL_FIT_FROM) return "partial";
  return "weak";
}

export const FIT_BAND_WORDS: Record<FitBand, string> = {
  strong: "strong fit",
  partial: "partial fit",
  weak: "weak fit",
};
