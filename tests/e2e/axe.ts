import { expect, type Page, type TestInfo } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

// Lower-cases the label and collapses every run of non-alphanumeric
// characters into a single hyphen, trimming any leading/trailing hyphen, so
// labels like "/setup" and "/ (Home)" become safe, readable filename parts
// ("setup", "home").
function slugify(label: string): string {
  return label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * Scans the current URL once per color scheme and asserts zero violations.
 * Reloads for each scheme rather than flipping it on the live page, so
 * next-themes resolves "system" from the color scheme the page is actually
 * born with instead of racing its own change listener.
 *
 * Right after the reload for each scheme (before the axe scan itself), saves
 * a full-page screenshot under test-results/screens/ so a human reviewer can
 * see exactly what was scanned, in every project and both color schemes.
 */
export async function scanForViolations(page: Page, label: string, testInfo: TestInfo) {
  const slug = slugify(label);

  for (const colorScheme of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme });
    await page.reload();

    await page.screenshot({
      path: `test-results/screens/${testInfo.project.name}-${slug}-${colorScheme}.png`,
      fullPage: true,
    });

    const results = await new AxeBuilder({ page }).analyze();
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
