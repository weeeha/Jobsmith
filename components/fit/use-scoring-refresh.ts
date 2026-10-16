"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

import { FIT_POLL_MAX, FIT_POLL_MS } from "@/lib/fit/card";

/**
 * Refreshes the page on a timer while a background score is running, so the
 * result shows up without a reload. Stops at a cap: a run lost with its
 * function instance shows as failed once it goes stale.
 */
export function useScoringRefresh(active: boolean): void {
  const router = useRouter();
  React.useEffect(() => {
    if (!active) return;
    let refreshes = 0;
    const timer = window.setInterval(() => {
      refreshes += 1;
      router.refresh();
      if (refreshes >= FIT_POLL_MAX) window.clearInterval(timer);
    }, FIT_POLL_MS);
    return () => window.clearInterval(timer);
  }, [active, router]);
}

/** The same refresh for a page whose only client part is this. */
export function ScoringRefresh({ active }: { active: boolean }) {
  useScoringRefresh(active);
  return null;
}
