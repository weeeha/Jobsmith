// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { act, render, screen } from "@testing-library/react";
import { LiveAnnouncerProvider, useAnnounce } from "@/components/live-announcer";

function Announcer({ message }: { message: string }) {
  const announce = useAnnounce();
  return (
    <button type="button" onClick={() => announce(message)}>
      Announce
    </button>
  );
}

describe("LiveAnnouncerProvider", () => {
  it("renders an empty, visually hidden aria-live region by default", () => {
    render(
      <LiveAnnouncerProvider>
        <p>content</p>
      </LiveAnnouncerProvider>,
    );
    const region = screen.getByRole("status");
    expect(region.textContent).toBe("");
    expect(region.className).toContain("sr-only");
  });

  it("puts the announced message into the live region", () => {
    vi.useFakeTimers();
    render(
      <LiveAnnouncerProvider>
        <Announcer message="Moved Priya Raman at Acme Robotics to Applied." />
      </LiveAnnouncerProvider>,
    );
    act(() => {
      screen.getByRole("button").click();
      vi.advanceTimersByTime(50);
    });
    expect(screen.getByRole("status").textContent).toBe(
      "Moved Priya Raman at Acme Robotics to Applied.",
    );
    vi.useRealTimers();
  });

  it("drops a pending announcement when the provider unmounts", () => {
    vi.useFakeTimers();
    const { unmount } = render(
      <LiveAnnouncerProvider>
        <Announcer message="Saved." />
      </LiveAnnouncerProvider>,
    );
    act(() => {
      screen.getByRole("button").click();
    });
    expect(vi.getTimerCount()).toBe(1);
    unmount();
    expect(vi.getTimerCount()).toBe(0);
    vi.useRealTimers();
  });

  it("a newer announcement replaces a pending older one", () => {
    vi.useFakeTimers();
    function Two() {
      const announce = useAnnounce();
      return (
        <button
          type="button"
          onClick={() => {
            announce("First.");
            announce("Second.");
          }}
        >
          Announce twice
        </button>
      );
    }
    render(
      <LiveAnnouncerProvider>
        <Two />
      </LiveAnnouncerProvider>,
    );
    act(() => {
      screen.getByRole("button").click();
    });
    expect(vi.getTimerCount()).toBe(1);
    act(() => {
      vi.advanceTimersByTime(50);
    });
    expect(screen.getByRole("status").textContent).toBe("Second.");
    vi.useRealTimers();
  });

  it("throws when useAnnounce is called outside the provider", () => {
    function Bad() {
      useAnnounce();
      return null;
    }
    expect(() => render(<Bad />)).toThrow();
  });
});
