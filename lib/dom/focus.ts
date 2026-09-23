/**
 * True when focus has effectively been lost from the app's point of view:
 * either the browser already fell back to `document.body` (the usual
 * outcome once a focused element is removed from the document or gains a
 * `disabled` attribute), or - confirmed empirically while manually testing
 * this milestone's job page in a real browser - the focused element was
 * left sitting in place with `disabled` now true instead of being blurred
 * at all. Both are equally unusable: a disabled control cannot be
 * activated or tabbed to again, so leaving focus on it is no better than
 * losing it to <body>.
 *
 * Deliberately does not require focus to already be on `document.body`:
 * timing between a browser's own (sometimes asynchronous) blur-on-disable
 * behavior and a React effect reacting to the prop change that caused the
 * disabling is not guaranteed, so a caller that only checked for
 * `document.body` could run its recovery before that fallback happens and
 * wrongly conclude there is nothing to fix.
 */
export function focusWasLost(): boolean {
  if (typeof document === "undefined") return false;
  const active = document.activeElement;
  if (active === null || active === document.body) return true;
  return "disabled" in active && (active as HTMLButtonElement).disabled === true;
}

/**
 * Corrects focus every time it is lost within the next `timeoutMs`, rather
 * than checking once immediately after an action settles. A Base UI popup
 * (a dialog, a dropdown menu) that closes as part of the same action
 * queues its own focus-restoration behind its own exit animation -
 * confirmed empirically against CloseDialog: checking focusWasLost() once,
 * right when the server confirms a close succeeded, reliably observed "not
 * lost yet" (focus was still on the dialog's own, soon-to-be-removed
 * "Close job" button, mid animation) and skipped the very loss that then
 * happened once that animation actually finished and the popup's own
 * restoration failed to find its original target (long gone by then) and
 * fell back to <body>. Polls on a short interval - not a one-time check,
 * and not a delay tied to any one animation's duration - for the whole
 * window, correcting every loss it finds rather than stopping after the
 * first: confirmed empirically that the popup's own queued restoration can
 * still fire and re-lose focus after an earlier poll already fixed it once
 * (a plain browser-timing difference, not tied to any one browser).
 */
export function correctFocusOnceLost(focus: () => void, timeoutMs = 1000): void {
  if (typeof window === "undefined") return;
  const deadline = Date.now() + timeoutMs;
  const POLL_MS = 20;
  function tick() {
    if (focusWasLost()) {
      focus();
    }
    if (Date.now() >= deadline) return;
    setTimeout(tick, POLL_MS);
  }
  setTimeout(tick, POLL_MS);
}
