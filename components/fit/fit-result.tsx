"use client";

import * as React from "react";

import { BAND_TONE, ToneChip } from "@/components/fit/fit-chips";
import { LocalTime } from "@/components/local-time";
import type { FitBand } from "@/lib/fit/bands";
import type { HardFilterResult } from "@/lib/fit/hard-filters";
import {
  cardFailedChip,
  failedBoxHeading,
  failedFilterLine,
  filtersFootnote,
  FIT_MESSAGES,
  scoreChipText,
} from "@/lib/fit/messages";
import type { StoredFit } from "@/lib/fit/stored";
import { cn } from "@/lib/utils";

type HeadingLevel = 2 | 3;

/**
 * The fit card's frame: one bordered surface with the "Fit" heading. The job
 * page puts it under an h1 and the test box under an h2, so the heading level
 * is the caller's.
 */
export const FitFrame = React.forwardRef<
  HTMLElement,
  { level: HeadingLevel; headerExtra?: React.ReactNode; children?: React.ReactNode; className?: string }
>(function FitFrame({ level, headerExtra, children, className }, ref) {
  const id = React.useId();
  const Heading = level === 2 ? "h2" : "h3";
  return (
    <section
      ref={ref}
      aria-labelledby={id}
      tabIndex={-1}
      className={cn("flex flex-col gap-3 rounded-xl bg-card p-4 text-sm ring-1 ring-foreground/10 outline-none", className)}
    >
      <div className="flex flex-wrap items-center gap-2">
        <Heading id={id} className="text-base font-semibold text-foreground">
          {FIT_MESSAGES.heading}
        </Heading>
        {headerExtra}
      </div>
      {children}
    </section>
  );
});

function PointList({ label, items }: { label: string; items: string[] }) {
  const id = React.useId();
  return (
    <div className="flex min-w-0 flex-1 flex-col gap-1">
      <p id={id} className="text-xs font-medium text-muted-foreground">
        {label}
      </p>
      <ul aria-labelledby={id} className="flex flex-col gap-1">
        {items.map((item) => (
          <li key={item} className="break-words text-foreground">
            {item}
          </li>
        ))}
      </ul>
    </div>
  );
}

/** A scored result: chips and date in the header, the failed filters, the summary, pros and cons, and the filter line. */
export function FitResult({
  fit,
  band,
  hardFilters,
  level,
  frameRef,
}: {
  fit: StoredFit;
  band: FitBand;
  hardFilters: HardFilterResult;
  level: HeadingLevel;
  frameRef?: React.Ref<HTMLElement>;
}) {
  const failedChecks = hardFilters.checks.filter((check) => check.outcome === "fails");
  const footnote = filtersFootnote(hardFilters.checks);
  return (
    <FitFrame
      ref={frameRef}
      level={level}
      headerExtra={
        <>
          <ToneChip tone={BAND_TONE[band]}>{scoreChipText(fit.score, band)}</ToneChip>
          {failedChecks.length > 0 ? <ToneChip tone="action">{cardFailedChip(failedChecks.length)}</ToneChip> : null}
          <span className="ml-auto text-xs text-muted-foreground">
            {FIT_MESSAGES.scored} <LocalTime value={fit.scoredAt} mode="day" />
          </span>
        </>
      }
    >
      {failedChecks.length > 0 ? (
        <div className="flex flex-col gap-1 rounded-lg bg-muted px-3 py-2 text-xs">
          <p className="font-medium text-foreground">{failedBoxHeading(failedChecks.length)}</p>
          {failedChecks.map((check) => (
            <p key={check.filter} className="break-words text-muted-foreground">
              {failedFilterLine(check)}
            </p>
          ))}
        </div>
      ) : null}
      <p className="break-words text-muted-foreground">{fit.summary}</p>
      {fit.pros.length > 0 || fit.cons.length > 0 ? (
        <div className="flex flex-col gap-3 sm:flex-row sm:gap-6">
          {fit.pros.length > 0 ? <PointList label={FIT_MESSAGES.pros} items={fit.pros} /> : null}
          {fit.cons.length > 0 ? <PointList label={FIT_MESSAGES.cons} items={fit.cons} /> : null}
        </div>
      ) : null}
      {footnote ? <p className="text-xs text-muted-foreground">{footnote}</p> : null}
    </FitFrame>
  );
}
