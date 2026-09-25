import { expect, type Page, type TestInfo } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

function slugify(label: string): string {
  return label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * Scans the whole current page in both color schemes with no reload, for
 * content driven by local component state a reload would lose - the
 * Documents editor's own open/editing state (document-editor.tsx's own
 * useState), which is neither a real URL (scanForViolations' target) nor an
 * overlay sitting on top of an otherwise-inert page (scanOpenOverlay's
 * target, which is why that helper scopes its scan to `[role="dialog"]`).
 * The editor is inline content with nothing behind it to exclude, so this
 * scans the entire page, and needs no "reopen" callback: nothing here ever
 * closes on its own the way a dialog's exit animation can undo a caller's
 * assumption that it is still open.
 */
export async function scanInPlace(page: Page, label: string, testInfo: TestInfo) {
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
    await page.waitForFunction(() => document.getAnimations().every((a) => a.playState !== "running"));

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
