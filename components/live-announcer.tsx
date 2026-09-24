"use client";

import * as React from "react";

const LiveAnnouncerContext = React.createContext<((message: string) => void) | null>(null);

export function LiveAnnouncerProvider({ children }: { children: React.ReactNode }) {
  const [message, setMessage] = React.useState("");

  const announce = React.useCallback((next: string) => {
    // A live region only speaks on a text change. Setting the identical
    // string twice in a row (moving two different cards to the same column,
    // for example, can produce the same sentence) would otherwise be silent
    // the second time, so this clears first and sets the real text on the
    // next tick, which is two distinct DOM mutations for assistive tech to
    // pick up rather than one no-op write.
    setMessage("");
    window.setTimeout(() => setMessage(next), 50);
  }, []);

  return (
    <LiveAnnouncerContext.Provider value={announce}>
      {children}
      <div role="status" aria-live="polite" className="sr-only">
        {message}
      </div>
    </LiveAnnouncerContext.Provider>
  );
}

export function useAnnounce(): (message: string) => void {
  const announce = React.useContext(LiveAnnouncerContext);
  if (!announce) {
    throw new Error("useAnnounce must be used within a LiveAnnouncerProvider");
  }
  return announce;
}
