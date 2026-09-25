import { test, expect } from "@playwright/test";
import { scanForViolations } from "./axe";
import { login, uniqueName, addJobAndOpen } from "./session";

test("phone: paste a document, the tab strip wraps, and neither Prep nor Documents overflows", async ({
  page,
}, testInfo) => {
  test.skip(
    testInfo.project.name !== "phone",
    "phone board only; playwright.config.ts also restricts this file to the phone project",
  );

  await login(page);
  const company = uniqueName(testInfo, "Acme Robotics");
  const role = "Product Designer";
  await addJobAndOpen(page, company, role);
  const title = uniqueName(testInfo, "Pitch");

  await page.getByRole("tab", { name: "Prep" }).click();
  await page.waitForURL(/tab=prep/);

  // Six tabs at 390px should wrap to a second row instead of forcing the
  // page wider - checked by position (Prep sits below Overview), which the
  // scrollWidth check further down cannot show by itself (a tab strip that
  // silently clipped instead of wrapping would still pass that check).
  const overviewBox = await page.getByRole("tab", { name: "Overview" }).boundingBox();
  const prepBox = await page.getByRole("tab", { name: "Prep" }).boundingBox();
  if (!overviewBox || !prepBox) {
    throw new Error("could not measure the job page tab strip");
  }
  expect(prepBox.y).toBeGreaterThan(overviewBox.y);

  await page.getByRole("button", { name: "Paste markdown" }).click();
  const dialog = page.getByRole("dialog", { name: "Paste markdown" });
  await expect(dialog).toBeVisible();
  await dialog.getByLabel("Title").fill(title);
  await dialog.getByLabel("Markdown").fill(`# ${title}\n\nA short pitch pasted from a phone.`);
  await dialog.getByRole("button", { name: "Save" }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByRole("link", { name: title })).toBeVisible();

  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
    await page.evaluate(() => window.innerWidth),
  );
  await scanForViolations(page, "phone prep tab", testInfo);

  await page.getByRole("tab", { name: "Documents" }).click();
  await page.waitForURL(/tab=documents/);
  await expect(page.getByText("No documents yet.")).toBeVisible();

  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
    await page.evaluate(() => window.innerWidth),
  );
  await scanForViolations(page, "phone documents tab", testInfo);
});
