import type * as React from "react";

import { Badge } from "@/components/ui/badge";
import { FIT_BAND_WORDS, type FitBand } from "@/lib/fit/bands";
import type { CardFit } from "@/lib/fit/board";
import { boardFailedChip, FIT_MESSAGES } from "@/lib/fit/messages";
import { cn } from "@/lib/utils";

export type ChipTone = "approved" | "pending" | "action" | "neutral" | "outline";

// The drafts' Badge variants: Approved, Pending and Action sit on the status
// soft tokens; a weak score stays neutral. Tone always comes with a word on
// screen or in screen-reader text, never with color alone.
const TONE_CLASSES: Record<ChipTone, string> = {
  approved: "bg-status-approved-soft text-status-approved",
  pending: "bg-status-pending-soft text-status-pending",
  action: "bg-status-action-soft text-status-action",
  neutral: "",
  outline: "",
};

export const BAND_TONE: Record<FitBand, ChipTone> = { good: "approved", mixed: "pending", weak: "neutral" };

export function ToneChip({
  tone,
  className,
  ...props
}: { tone: ChipTone } & Omit<React.ComponentProps<typeof Badge>, "variant">) {
  return <Badge variant={tone === "outline" ? "outline" : "secondary"} className={cn(TONE_CLASSES[tone], className)} {...props} />;
}

/**
 * A board card's fit chips: the score (number only, as drawn, with the band
 * word for screen readers) or "Scoring", then the filters the job fails.
 * Rendered inside the card's own chip row.
 */
export function CardFitChips({ fit }: { fit: CardFit }) {
  return (
    <>
      {fit.scoring ? (
        <ToneChip tone="outline">{FIT_MESSAGES.boardScoring}</ToneChip>
      ) : fit.score !== null && fit.band !== null ? (
        <ToneChip tone={BAND_TONE[fit.band]} data-band={fit.band}>
          <span className="sr-only">Fit </span>
          <span>{fit.score}</span>
          <span className="sr-only">, {FIT_BAND_WORDS[fit.band]}</span>
        </ToneChip>
      ) : null}
      {fit.failed.length > 0 ? <ToneChip tone="action">{boardFailedChip(fit.failed)}</ToneChip> : null}
    </>
  );
}

export function hasCardFitChips(fit: CardFit): boolean {
  return fit.scoring || fit.score !== null || fit.failed.length > 0;
}
