import { readFileSync } from "node:fs";
import path from "node:path";
import { test, expect, type Page, type TestInfo } from "@playwright/test";
import { scanForViolations } from "./axe";
import { scanOpenOverlay } from "./scan-open";
import { login, uniqueName, addJobAndOpen } from "./session";

const fixture = (name: string) => readFileSync(path.join(__dirname, "../fixtures/compare", name), "utf8");

/** A job with a cover letter pasted twice; returns the compare page URL. */
async function coverLetterWithTwoVersions(page: Page, testInfo: TestInfo): Promise<{ title: string; slug: string }> {
  await login(page);
  const slug = await addJobAndOpen(page, uniqueName(testInfo, "Northwind Traders"), "Senior Product Designer");
  const title = uniqueName(testInfo, "Cover letter");
  await page.goto(`/jobs/${slug}?tab=documents`);

  await page.getByRole("button", { name: "Paste markdown" }).click();
  const first = page.getByRole("dialog", { name: "Paste markdown" });
  await first.getByLabel("Title").fill(title);
  await first.getByLabel("Markdown").fill(fixture("cover-letter-v1.md"));
  await first.getByRole("button", { name: "Save" }).click();
  await expect(first).toBeHidden();

  await page.getByRole("button", { name: `Paste a new version of ${title}` }).click();
  const second = page.getByRole("dialog", { name: "Paste a new version" });
  await second.getByLabel("Markdown").fill(fixture("cover-letter-v2.md"));
  await second.getByRole("button", { name: "Save" }).click();
  await expect(second).toBeHidden();
  await expect(page.getByText(`Saved ${title} as version 2.`)).toBeAttached();

  await page.getByRole("link", { name: `Compare versions of ${title}` }).click();
  await expect(page).toHaveURL(/\/compare\?doc=/);
  await expect(page.getByRole("heading", { level: 1, name: title })).toBeVisible();
  return { title, slug };
}

test("two versions of a cover letter: split view shows word marks on desktop", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === "apply-phone", "desktop only");
  test.slow();
  await coverLetterWithTwoVersions(page, testInfo);

  const split = page.locator('[data-view="split"]');
  await expect(split).toBeVisible();
  await expect(page.locator('[data-view="inline"]')).toBeHidden();

  expect(await split.locator("del").count()).toBeGreaterThan(0);
  expect(await split.locator("ins").count()).toBeGreaterThan(0);
  // Hidden text for screen readers sits inside every mark.
  await expect(split.locator("del .sr-only", { hasText: "removed" }).first()).toBeAttached();
  await expect(split.locator("ins .sr-only", { hasText: "added" }).first()).toBeAttached();
  await expect(split.locator("ins", { hasText: "shared component library" })).toBeVisible();
  await expect(page.getByText(/words? added/)).toBeVisible();
});

test("phone viewport: only the inline view is visible, version pickers open from 'Versions 1 and 2'", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "apply-phone", "phone only");
  test.slow();
  await coverLetterWithTwoVersions(page, testInfo);

  await expect(page.locator('[data-view="inline"]')).toBeVisible();
  await expect(page.locator('[data-view="split"]')).toBeHidden();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
    await page.evaluate(() => window.innerWidth),
  );

  const trigger = page.getByRole("button", { name: "Versions 1 and 2" });
  await trigger.click();
  const dialog = page.getByRole("dialog", { name: "Versions" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByLabel("Older version")).toHaveValue("1");
  await expect(dialog.getByLabel("Newer version")).toHaveValue("2");
});

test("keyboard: ']' walks to every change in order and '[' walks back; focus lands on each change", async ({
  page,
}, testInfo) => {
  test.slow();
  await coverLetterWithTwoVersions(page, testInfo);
  const phone = testInfo.project.name === "apply-phone";
  const view = page.locator(phone ? '[data-view="inline"]' : '[data-view="split"]');
  const changes = view.locator("[data-change]");
  const total = await changes.count();
  expect(total).toBeGreaterThanOrEqual(2);

  await page.locator("body").click({ position: { x: 1, y: 1 } });
  for (let i = 0; i < total; i++) {
    await page.keyboard.press("]");
    await expect(changes.nth(i)).toBeFocused();
    await expect(page.getByText(`Change ${i + 1} of ${total}`).first()).toBeVisible();
  }
  // Stops at the end.
  await page.keyboard.press("]");
  await expect(changes.nth(total - 1)).toBeFocused();

  for (let i = total - 2; i >= 0; i--) {
    await page.keyboard.press("[");
    await expect(changes.nth(i)).toBeFocused();
  }
});

test("equal versions show 'Pick two different versions'", async ({ page }, testInfo) => {
  test.slow();
  await coverLetterWithTwoVersions(page, testInfo);
  const url = new URL(page.url());
  url.searchParams.set("a", "2");
  url.searchParams.set("b", "2");
  await page.goto(url.pathname + url.search);
  await expect(page.getByText("Pick two different versions")).toBeVisible();
  await expect(page.locator("[data-change]")).toHaveCount(0);
});

test("axe in light and dark on split and inline views", async ({ page }, testInfo) => {
  test.slow();
  await coverLetterWithTwoVersions(page, testInfo);
  const url = new URL(page.url());

  for (const view of ["split", "inline"] as const) {
    url.searchParams.set("view", view);
    await page.goto(url.pathname + url.search);
    await expect(page.locator(`[data-view="${view}"]`)).toBeVisible();
    await scanForViolations(page, `compare ${view} view`, testInfo);
  }

  if (testInfo.project.name === "apply-phone") {
    url.searchParams.delete("view");
    await page.goto(url.pathname + url.search);
    const dialog = page.getByRole("dialog", { name: "Versions" });
    await scanOpenOverlay(page, "compare version picker sheet", testInfo, async () => {
      if (!(await dialog.isVisible())) {
        await page.getByRole("button", { name: "Versions 1 and 2" }).click();
      }
      await expect(dialog).toBeVisible();
    });
  }
});
