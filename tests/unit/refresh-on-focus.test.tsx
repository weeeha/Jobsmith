// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render } from "@testing-library/react";

const { refresh } = vi.hoisted(() => ({ refresh: vi.fn() }));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh }),
}));

import { RefreshOnFocus } from "@/components/refresh-on-focus";

describe("RefreshOnFocus", () => {
  beforeEach(() => {
    refresh.mockClear();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("refreshes on window focus", () => {
    render(<RefreshOnFocus />);
    window.dispatchEvent(new Event("focus"));
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("does not refresh again inside the 10 second window", () => {
    render(<RefreshOnFocus />);
    window.dispatchEvent(new Event("focus"));
    vi.advanceTimersByTime(5000);
    window.dispatchEvent(new Event("focus"));
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("refreshes again after 10 seconds", () => {
    render(<RefreshOnFocus />);
    window.dispatchEvent(new Event("focus"));
    vi.advanceTimersByTime(10_001);
    window.dispatchEvent(new Event("focus"));
    expect(refresh).toHaveBeenCalledTimes(2);
  });

  it("refreshes when the tab becomes visible", () => {
    Object.defineProperty(document, "visibilityState", { value: "visible", configurable: true });
    render(<RefreshOnFocus />);
    document.dispatchEvent(new Event("visibilitychange"));
    expect(refresh).toHaveBeenCalledTimes(1);
  });
});
