import { expect, type Page, type TestInfo } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

function slugify(label: string): string {
  return label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * Scans an already-open dialog or sheet in both color schemes, without the
 * full-page reload ./axe.ts's scanForViolations uses: a reload would close
 * any overlay driven by local component state, which every dialog and
 * sheet in this milestone is. `reopen` re-establishes the open overlay
 * after each scheme switch; it must leave the page with the overlay open
 * and nothing else mid-transition, the same expectation scanForViolations
 * has of the page it reloads onto.
 *
 * The axe run itself is scoped to the open popup (`[role="dialog"]`, which
 * both a Base UI Dialog and Sheet render), not the whole page: everything
 * behind an open modal is `aria-hidden` and inert, and WCAG 1.4.3 exempts
 * incidental text belonging to an inactive user interface component, so a
 * contrast reading on the page behind the overlay is a false positive of
 * scanning too broadly, not a defect. The page itself, with no overlay
 * open, is already covered by scanForViolations on the same route.
 *
 * Waiting for the browser's own matchMedia to report the emulated scheme
 * before calling `reopen()` stands in for the settle time a reload gives
 * scanForViolations, so next-themes' change listener is not still racing
 * the axe scan below (see the comment on scanForViolations, ./axe.ts, for
 * why the reload exists there in the first place). matchMedia flipping is
 * necessary but not sufficient, though: next-themes reacts to that same
 * media change on its own listener, which runs some time after (not
 * within) the task that already observed matchMedia's new value, so this
 * also waits for its actual effect - the "light"/"dark" class next-themes
 * writes to <html> - before treating the scheme switch as done.
 */
export async function scanOpenOverlay(
  page: Page,
  label: string,
  testInfo: TestInfo,
  reopen: () => Promise<void>,
) {
  const slug = slugify(label);

  for (const colorScheme of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme });
    await page.waitForFunction(
      (scheme) => window.matchMedia(`(prefers-color-scheme: ${scheme})`).matches,
      colorScheme,
    );
    await page.waitForFunction(
      (scheme) => document.documentElement.classList.contains(scheme),
      colorScheme,
    );
    await reopen();
    // Every themed element transitions its own colors (Button and friends
    // carry transition-all), so the class swap above starts a wave of CSS
    // transitions across the page, and the dialog/sheet entrance plays its
    // own short animation on top. Confirmed by direct inspection: scanning
    // while any of that is still running can catch an element between its
    // two themed colors, or board content behind the overlay at a
    // partially faded-in state, either of which axe-core's color-contrast
    // rule reads as an actual (if momentary) contrast failure -
    // reproducible under load, not under a fresh, idle run of the same
    // steps. Waiting for every running animation/transition to finish (not
    // a fixed delay, so it adapts if a duration token changes) is what a
    // reload gives scanForViolations for free.
    await page.waitForFunction(() => document.getAnimations().every((a) => a.playState !== "running"));

    await page.screenshot({
      path: `test-results/screens/${testInfo.project.name}-${slug}-${colorScheme}.png`,
      fullPage: true,
    });

    const results = await new AxeBuilder({ page }).include('[role="dialog"]').analyze();
    for (const violation of results.violations) {
      console.log(`[${label} / ${colorScheme}] ${violation.id} (${violation.impact}): ${violation.help}`);
      for (const node of violation.nodes) {
        console.log(`  target: ${node.target.join(", ")}`);
        console.log(`  summary: ${node.failureSummary}`);
      }
    }
    expect(results.violations, `${label} (${colorScheme}) axe violations`).toEqual([]);
  }
}
