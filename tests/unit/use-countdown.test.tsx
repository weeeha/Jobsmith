// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { useCountdown } from "@/components/player/use-countdown";

describe("useCountdown", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("counts down once a second and reports done at zero", () => {
    const { result } = renderHook(() => useCountdown(3, true));
    expect(result.current).toEqual({ remaining: 3, done: false });
    act(() => vi.advanceTimersByTime(1000));
    expect(result.current.remaining).toBe(2);
    act(() => vi.advanceTimersByTime(2000));
    expect(result.current).toEqual({ remaining: 0, done: true });
    act(() => vi.advanceTimersByTime(5000));
    expect(result.current.remaining).toBe(0);
  });

  it("does not tick while inactive", () => {
    const { result } = renderHook(() => useCountdown(3, false));
    act(() => vi.advanceTimersByTime(5000));
    expect(result.current).toEqual({ remaining: 3, done: false });
  });

  it("starts again from the full count when it becomes active again", () => {
    const { result, rerender } = renderHook(({ active }) => useCountdown(3, active), { initialProps: { active: true } });
    act(() => vi.advanceTimersByTime(2000));
    expect(result.current.remaining).toBe(1);
    rerender({ active: false });
    rerender({ active: true });
    expect(result.current.remaining).toBe(3);
  });

  it("clears its interval on unmount", () => {
    const { unmount } = renderHook(() => useCountdown(3, true));
    expect(vi.getTimerCount()).toBe(1);
    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });
});
