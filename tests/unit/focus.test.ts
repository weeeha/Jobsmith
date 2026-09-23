// @vitest-environment jsdom
import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { focusWasLost } from "@/lib/dom/focus";

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
