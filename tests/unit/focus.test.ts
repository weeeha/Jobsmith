// @vitest-environment jsdom
import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import { focusWasLost, correctFocusOnceLost } from "@/lib/dom/focus";

describe("focusWasLost", () => {
  let container: HTMLDivElement;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
  });

  afterEach(() => {
    container.remove();
    // Return focus to a neutral place so one test's element can't linger
    // as document.activeElement into the next.
    (document.activeElement as HTMLElement | null)?.blur?.();
  });

  it("is true when focus is on document.body", () => {
    document.body.focus();
    expect(document.activeElement).toBe(document.body);
    expect(focusWasLost()).toBe(true);
  });

  it("is false when focus is on an enabled button", () => {
    const button = document.createElement("button");
    container.appendChild(button);
    button.focus();
    expect(document.activeElement).toBe(button);
    expect(focusWasLost()).toBe(false);
  });

  it("is true when a focused button then becomes disabled", () => {
    const button = document.createElement("button");
    container.appendChild(button);
    button.focus();
    expect(document.activeElement).toBe(button);
    button.disabled = true;
    // jsdom does not auto-blur an element when it becomes disabled (real
    // Chromium sometimes does, real WebKit sometimes does not - this is
    // exactly the browser-timing inconsistency lib/dom/focus.ts's own
    // comment describes), so document.activeElement is still this button:
    // this exercises the "focused but now disabled" branch specifically,
    // not the document.body branch above.
    expect(document.activeElement).toBe(button);
    expect(focusWasLost()).toBe(true);
  });

  it("is false when focus is on an enabled input", () => {
    const input = document.createElement("input");
    container.appendChild(input);
    input.focus();
    expect(document.activeElement).toBe(input);
    expect(focusWasLost()).toBe(false);
  });
});

describe("correctFocusOnceLost", () => {
  let container: HTMLDivElement;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    container.remove();
    (document.activeElement as HTMLElement | null)?.blur?.();
  });

  it("corrects focus right away when it is already lost", () => {
    document.body.focus();
    const focus = vi.fn();
    correctFocusOnceLost(focus);
    vi.advanceTimersByTime(20);
    expect(focus).toHaveBeenCalledTimes(1);
  });

  // The whole point of this function: a still-focused, about-to-be-removed
  // control (standing in for a closing dialog's own button, mid exit
  // animation) must not make this give up early - it has to keep watching
  // until focus is actually lost, however long that takes within the
  // timeout.
  it("keeps watching through a delayed loss instead of giving up after one check", () => {
    const button = document.createElement("button");
    container.appendChild(button);
    button.focus();
    // Actually corrects the loss, the way a real caller's focus() does -
    // once called, later polls within the same window should see nothing
    // left to fix and stop calling it again.
    const replacement = document.createElement("button");
    container.appendChild(replacement);
    const focus = vi.fn(() => replacement.focus());
    correctFocusOnceLost(focus, 500);

    vi.advanceTimersByTime(100);
    expect(focus).not.toHaveBeenCalled();

    // Simulate the delayed loss: the control that held focus is removed
    // (a dialog's exit animation finishing and unmounting its own
    // now-inert button), which jsdom, like a real browser, falls back to
    // <body> for.
    button.remove();
    expect(document.activeElement).toBe(document.body);

    vi.advanceTimersByTime(100);
    expect(focus).toHaveBeenCalledTimes(1);
  });

  it("gives up quietly once the timeout passes with focus never lost", () => {
    const button = document.createElement("button");
    container.appendChild(button);
    button.focus();
    const focus = vi.fn();
    correctFocusOnceLost(focus, 100);

    vi.advanceTimersByTime(200);
    expect(focus).not.toHaveBeenCalled();
  });

  // A popup's own queued restoration is a second, independent process that
  // can re-lose focus after an earlier poll already corrected it once - a
  // single correction is not enough to trust here.
  it("corrects focus again if it is lost a second time within the same window", () => {
    document.body.focus();
    const focus = vi.fn(() => {
      const replacement = document.createElement("button");
      container.appendChild(replacement);
      replacement.focus();
    });
    correctFocusOnceLost(focus, 500);
    vi.advanceTimersByTime(20);
    expect(focus).toHaveBeenCalledTimes(1);

    // Whatever the caller's own focus() callback focused is now itself
    // removed - standing in for a popup's own delayed restoration firing
    // after the fact and finding nothing, the same way CloseDialog's does.
    (document.activeElement as HTMLElement).remove();
    vi.advanceTimersByTime(20);
    expect(focus).toHaveBeenCalledTimes(2);
  });
});
