"use client";

import * as React from "react";

/**
 * A whole-second countdown. It ticks once a second while `active`, starts
 * again from the full count each time `active` turns on, and clears its
 * interval on unmount.
 */
export function useCountdown(seconds: number, active: boolean): { remaining: number; done: boolean } {
  const [remaining, setRemaining] = React.useState(seconds);
  const [wasActive, setWasActive] = React.useState(active);

  // Reset while rendering (React's own "adjust state on a prop change"
  // pattern), so the first frame of a new count already reads the full count.
  if (active !== wasActive) {
    setWasActive(active);
    if (active) setRemaining(seconds);
  }

  React.useEffect(() => {
    if (!active) return;
    const id = window.setInterval(() => setRemaining((r) => Math.max(0, r - 1)), 1000);
    return () => window.clearInterval(id);
  }, [active, seconds]);

  return { remaining, done: remaining <= 0 };
}
