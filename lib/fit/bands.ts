// The score bands, in one place. Bands follow the user's own score threshold
// rather than fixed numbers, so "good" always means "at or above the line I
// set". The fit card's chip, the board chip and their screen-reader words
// all read them from here.
export const FIT_BANDS = ["good", "mixed", "weak"] as const;
export type FitBand = (typeof FIT_BANDS)[number];

/** How far below the threshold a score still counts as mixed. */
export const MIXED_BAND_WIDTH = 15;

export function fitBand(score: number, threshold: number): FitBand {
  if (score >= threshold) return "good";
  if (score >= threshold - MIXED_BAND_WIDTH) return "mixed";
  return "weak";
}

export const FIT_BAND_WORDS: Record<FitBand, string> = {
  good: "Good fit",
  mixed: "Mixed",
  weak: "Weak fit",
};
