"use client";

import * as React from "react";

import { PREP_COPY } from "@/lib/prep/copy";

// The seconds at which the timer speaks, once each: ticking every second would
// be read out line by line.
const ANNOUNCE_AT = new Set([30, 10]);

export function formatClock(remaining: number): string {
  const total = Math.max(0, Math.ceil(remaining));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

/**
 * The silent gap's countdown. The digits are a timer that stays out of the
 * live region; a separate polite status says "30 seconds left." and
 * "10 seconds left." and nothing else.
 */
export function DrillTimer({ remaining }: { remaining: number }): React.ReactElement {
  const whole = Math.ceil(remaining);
  return (
    <div className="flex flex-col items-center gap-1">
      <div
        role="timer"
        aria-label={PREP_COPY.drill.timerLabel}
        aria-live="off"
        className="text-6xl font-semibold tabular-nums text-foreground"
      >
        {formatClock(remaining)}
      </div>
      <span role="status" aria-live="polite" className="sr-only">
        {ANNOUNCE_AT.has(whole) ? PREP_COPY.drill.timeLeft(whole) : ""}
      </span>
    </div>
  );
}
