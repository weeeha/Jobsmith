import { expect, type Page, type TestInfo } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { freezeTransitions } from "./freeze-transitions";

function slugify(label: string): string {
  return label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * Scans an open dropdown menu in both color schemes, with no reload (a
 * reload would close it). The run is scoped to the menu popup, as
 * scanOpenOverlay is to a dialog: the popup is portaled to the end of <body>,
 * outside every landmark by construction, so the `region` best practice
 * cannot apply to it, and the focus guards Base UI puts beside it are
 * library internals. The page behind it is already covered by
 * scanForViolations on the same route with the menu closed.
 */
export async function scanOpenMenu(page: Page, label: string, testInfo: TestInfo) {
  const slug = slugify(label);
  const unfreeze = await freezeTransitions(page);

  try {
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
      await expect(page.getByRole("menu")).toBeVisible();
      await page.waitForFunction(() => document.getAnimations().every((a) => a.playState !== "running"));

      await page.screenshot({
        path: `test-results/screens/${testInfo.project.name}-${slug}-${colorScheme}.png`,
        fullPage: true,
      });

      const results = await new AxeBuilder({ page }).include('[role="menu"]').disableRules(["region"]).analyze();
      for (const violation of results.violations) {
        console.log(`[${label} / ${colorScheme}] ${violation.id} (${violation.impact}): ${violation.help}`);
        for (const node of violation.nodes) {
          console.log(`  target: ${node.target.join(", ")}`);
          console.log(`  summary: ${node.failureSummary}`);
        }
      }
      expect(results.violations, `${label} (${colorScheme}) axe violations`).toEqual([]);
    }
  } finally {
    await unfreeze();
  }
}
