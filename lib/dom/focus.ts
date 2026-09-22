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
