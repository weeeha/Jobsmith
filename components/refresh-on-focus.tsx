"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

const MIN_INTERVAL_MS = 10_000;

export function RefreshOnFocus(): null {
  const router = useRouter();
  const lastRefreshRef = React.useRef(0);

  React.useEffect(() => {
    function maybeRefresh() {
      const now = Date.now();
      if (now - lastRefreshRef.current < MIN_INTERVAL_MS) return;
      lastRefreshRef.current = now;
      router.refresh();
    }
    function onVisibilityChange() {
      if (document.visibilityState === "visible") maybeRefresh();
    }
    window.addEventListener("focus", maybeRefresh);
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      window.removeEventListener("focus", maybeRefresh);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [router]);

  return null;
}
