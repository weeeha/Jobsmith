"use client";

import * as React from "react";

type MediaSessionLike = {
  metadata: unknown;
  playbackState?: string;
  setActionHandler(action: string, handler: (() => void) | null): void;
};

function sessionOrNull(): MediaSessionLike | null {
  if (typeof navigator === "undefined" || !("mediaSession" in navigator)) return null;
  return (navigator as unknown as { mediaSession: MediaSessionLike }).mediaSession ?? null;
}

// A pause that the user did not ask for within this window, on a hidden page,
// is the browser stopping the audio.
const USER_ACTION_WINDOW_MS = 1000;

/**
 * Lock-screen and headset controls, plus one flag: `backgroundStopped` turns
 * true when the page is hidden, audio is playing and the browser pauses it on
 * its own (a phone that does not keep audio going with the screen off). The
 * Listen screen shows the sentence once. Every browser API is feature-detected.
 */
export function useMediaSession(input: {
  title: string;
  artist: string;
  artworkUrl: string;
  onPlay(): void;
  onPause(): void;
  onPrevious(): void;
  onNext(): void;
  active: boolean;
}): { backgroundStopped: boolean } {
  const [backgroundStopped, setBackgroundStopped] = React.useState(false);
  const latest = React.useRef(input);
  React.useEffect(() => {
    latest.current = input;
  });
  const lastUserAction = React.useRef(0);
  const { title, artist, artworkUrl, active } = input;

  React.useEffect(() => {
    const session = sessionOrNull();
    if (!session) return;
    if (typeof MediaMetadata === "function") {
      try {
        session.metadata = new MediaMetadata({
          title,
          artist,
          artwork: [{ src: artworkUrl, sizes: "any", type: "image/svg+xml" }],
        });
      } catch {
        // A browser that rejects the artwork still gets the controls.
      }
    }
    const handlers: [string, () => void][] = [
      ["play", () => ((lastUserAction.current = Date.now()), latest.current.onPlay())],
      ["pause", () => ((lastUserAction.current = Date.now()), latest.current.onPause())],
      ["previoustrack", () => ((lastUserAction.current = Date.now()), latest.current.onPrevious())],
      ["nexttrack", () => ((lastUserAction.current = Date.now()), latest.current.onNext())],
    ];
    for (const [action, handler] of handlers) {
      try {
        session.setActionHandler(action, handler);
      } catch {
        // An action this browser does not support.
      }
    }
    return () => {
      for (const [action] of handlers) {
        try {
          session.setActionHandler(action, null);
        } catch {
          // Same.
        }
      }
    };
  }, [title, artist, artworkUrl]);

  React.useEffect(() => {
    const session = sessionOrNull();
    if (session) session.playbackState = active ? "playing" : "paused";
  }, [active]);

  React.useEffect(() => {
    if (!active) return;
    // Media events do not bubble, but a capture listener on the document sees them.
    const onPause = (event: Event) => {
      const media = event.target as { ended?: boolean } | null;
      if (!media || typeof media.ended !== "boolean" || media.ended) return;
      if (!document.hidden) return;
      if (Date.now() - lastUserAction.current < USER_ACTION_WINDOW_MS) return;
      setBackgroundStopped(true);
      latest.current.onPause();
    };
    document.addEventListener("pause", onPause, true);
    return () => document.removeEventListener("pause", onPause, true);
  }, [active]);

  return { backgroundStopped };
}
