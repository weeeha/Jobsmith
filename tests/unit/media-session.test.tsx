// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, renderHook } from "@testing-library/react";
import { useMediaSession } from "@/components/player/media-session";

type Handler = () => void;

function installSession() {
  const handlers = new Map<string, Handler | null>();
  const session = {
    metadata: null as unknown,
    playbackState: "none",
    setActionHandler: vi.fn((action: string, handler: Handler | null) => void handlers.set(action, handler)),
  };
  Object.defineProperty(navigator, "mediaSession", { value: session, configurable: true });
  class FakeMetadata {
    constructor(public init: unknown) {}
  }
  vi.stubGlobal("MediaMetadata", FakeMetadata);
  return { session, handlers };
}

function setHidden(hidden: boolean) {
  Object.defineProperty(document, "hidden", { value: hidden, configurable: true });
}

const callbacks = () => ({ onPlay: vi.fn(), onPause: vi.fn(), onPrevious: vi.fn(), onNext: vi.fn() });
const BASE = { title: "Question bank", artist: "Northwind Traders", artworkUrl: "/brand/mark.svg" };

beforeEach(() => setHidden(false));
afterEach(() => {
  cleanup();
  delete (navigator as unknown as { mediaSession?: unknown }).mediaSession;
  vi.unstubAllGlobals();
  setHidden(false);
});

describe("useMediaSession", () => {
  it("sets metadata title, artist and the artwork, and the play, pause, previoustrack and nexttrack handlers", () => {
    const { session, handlers } = installSession();
    const cb = callbacks();
    renderHook(() => useMediaSession({ ...BASE, ...cb, active: true }));
    expect(session.metadata).toEqual({
      init: { title: "Question bank", artist: "Northwind Traders", artwork: [{ src: "/brand/mark.svg", sizes: "any", type: "image/svg+xml" }] },
    });
    handlers.get("play")?.();
    handlers.get("pause")?.();
    handlers.get("previoustrack")?.();
    handlers.get("nexttrack")?.();
    expect(cb.onPlay).toHaveBeenCalledTimes(1);
    expect(cb.onPause).toHaveBeenCalledTimes(1);
    expect(cb.onPrevious).toHaveBeenCalledTimes(1);
    expect(cb.onNext).toHaveBeenCalledTimes(1);
    expect(session.playbackState).toBe("playing");
  });

  it("clears the handlers on unmount", () => {
    const { handlers } = installSession();
    const view = renderHook(() => useMediaSession({ ...BASE, ...callbacks(), active: true }));
    view.unmount();
    expect([...handlers.values()].every((h) => h === null)).toBe(true);
  });

  it("reports backgroundStopped once when the page is hidden while playing and the audio pauses by itself", () => {
    installSession();
    const cb = callbacks();
    const { result } = renderHook(() => useMediaSession({ ...BASE, ...cb, active: true }));
    const audio = document.createElement("audio");
    document.body.appendChild(audio);
    expect(result.current.backgroundStopped).toBe(false);
    setHidden(true);
    act(() => void audio.dispatchEvent(new Event("pause")));
    expect(result.current.backgroundStopped).toBe(true);
    expect(cb.onPause).toHaveBeenCalledTimes(1);
  });

  it("ignores a pause on a visible page, a clip that ended, and a pause the user just asked for", () => {
    const { handlers } = installSession();
    const cb = callbacks();
    const { result } = renderHook(() => useMediaSession({ ...BASE, ...cb, active: true }));
    const audio = document.createElement("audio");
    document.body.appendChild(audio);
    act(() => void audio.dispatchEvent(new Event("pause"))); // visible
    setHidden(true);
    Object.defineProperty(audio, "ended", { value: true, configurable: true });
    act(() => void audio.dispatchEvent(new Event("pause"))); // ended
    Object.defineProperty(audio, "ended", { value: false, configurable: true });
    act(() => void handlers.get("pause")?.()); // lock-screen pause button
    act(() => void audio.dispatchEvent(new Event("pause")));
    expect(result.current.backgroundStopped).toBe(false);
    expect(cb.onPause).toHaveBeenCalledTimes(1); // only the user's own
  });

  it("does nothing when the player is not active", () => {
    installSession();
    const { result } = renderHook(() => useMediaSession({ ...BASE, ...callbacks(), active: false }));
    const audio = document.createElement("audio");
    document.body.appendChild(audio);
    setHidden(true);
    act(() => void audio.dispatchEvent(new Event("pause")));
    expect(result.current.backgroundStopped).toBe(false);
  });

  it("does nothing when navigator.mediaSession is missing", () => {
    vi.stubGlobal("MediaMetadata", undefined);
    const { result } = renderHook(() => useMediaSession({ ...BASE, ...callbacks(), active: true }));
    expect(result.current.backgroundStopped).toBe(false);
  });
});
