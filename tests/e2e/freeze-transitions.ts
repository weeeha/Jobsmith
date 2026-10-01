import type { Page } from "@playwright/test";

/**
 * Turns every CSS transition on the page off until the returned function is
 * called, so a live color-scheme switch lands on its final themed colors at
 * once instead of transitioning there.
 *
 * Why the scheme-switching scans need this: Button, Input, Textarea and the
 * Select trigger all transition `color`, and the dialog popup's bare
 * `duration-100` transitions every property (transition-property defaults to
 * `all`), so flipping next-themes' class starts a color transition on each of
 * them. In CI's Linux WebKit (the webkit and phone projects) some of those
 * transitions stay parked at their start value - the previous scheme's text
 * color - for over a second, while `document.getAnimations()` reports nothing
 * running, so the settle wait passes and axe reads a contrast failure the
 * settled page does not have. The traces show it directly: the full-page
 * screenshot taken more than a second after the switch still has dark
 * #09090b input text on the dark #212121 field, while untransitioned text
 * beside it (the radio labels) has already switched. It never reproduced on
 * macOS WebKit, idle or loaded, so it is an engine/runner behavior, not a
 * product color bug. What these scans assert is the contrast of each scheme's
 * settled colors, which this gives deterministically; CSS animations (the
 * overlay's entrance) are untouched and still waited out by the callers.
 */
export async function freezeTransitions(page: Page): Promise<() => Promise<void>> {
  const style = await page.addStyleTag({
    content: "*, *::before, *::after { transition: none !important; }",
  });
  return async () => {
    await style.evaluate((node) => node.parentNode?.removeChild(node));
    await style.dispose();
  };
}
