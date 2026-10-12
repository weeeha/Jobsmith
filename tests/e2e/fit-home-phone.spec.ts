import { test, expect } from "@playwright/test";
import { scanForViolations } from "./axe";
import { addJobOnBoard, login, uniqueName, utcInputValue } from "./session";

test("phone: Home, Preferences and Settings fit the screen and pass axe, and a move through the sheet offers the dialog", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "phone", "phone only; playwright.config.ts also restricts this file to the phone project");
  test.slow();
  await login(page);

  for (const [path, heading] of [
    ["/", "Home"],
    ["/preferences", "Preferences"],
    ["/settings", "Settings"],
  ] as const) {
    await page.goto(path);
    await expect(page.getByRole("heading", { level: 1, name: heading })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      await page.evaluate(() => window.innerWidth),
    );
    await scanForViolations(page, `phone ${path}`, testInfo);
  }

  await page.goto("/board");
  const company = uniqueName(testInfo, "Lumen Health");
  const role = "Product Design Manager";
  await addJobOnBoard(page, company, role);

  await page.getByRole("button", { name: `Move ${role} at ${company}` }).click();
  const sheet = page.getByRole("dialog", { name: "Move to" });
  await expect(sheet).toBeVisible();
  await sheet.getByRole("button", { name: "Applied" }).click();
  await expect(sheet).toBeHidden();

  await expect(page.getByText(`What is next for ${role} at ${company}?`)).toBeVisible();
  await page.getByRole("button", { name: "Set next action" }).click();
  const dialog = page.getByRole("dialog", { name: "Set the next action" });
  await expect(dialog).toBeVisible();
  await dialog.getByLabel("What is next").fill("Send the portfolio link");
  await dialog.getByRole("button", { name: "Save" }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByRole("button", { name: `Move ${role} at ${company}` })).toBeFocused();
});

test("phone: an 80-character role and company name wrap on Home, the job page and the next action dialog", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "phone", "phone only; playwright.config.ts also restricts this file to the phone project");
  test.slow();
  await login(page);

  // No spaces anywhere, so the browser has no break point to use. The suffix
  // keeps both names unique per run on the shared account.
  const suffix = Math.random().toString(36).slice(2, 8);
  const company = `Lumen${suffix}`.padEnd(80, "c");
  const role = `Designer${suffix}`.padEnd(80, "r");

  const noSidewaysScroll = async (where: string) => {
    const [scrollWidth, innerWidth] = await page.evaluate(() => [
      document.documentElement.scrollWidth,
      window.innerWidth,
    ]);
    expect(scrollWidth, `${where} scrolls sideways`).toBeLessThanOrEqual(innerWidth);
  };

  await page.goto("/board");
  await addJobOnBoard(page, company, role);
  await noSidewaysScroll("the board");

  await page.getByRole("button", { name: `Move ${role} at ${company}` }).click();
  const sheet = page.getByRole("dialog", { name: "Move to" });
  await sheet.getByRole("button", { name: "Applied" }).click();
  await expect(sheet).toBeHidden();

  await page.getByRole("button", { name: "Set next action" }).click();
  const dialog = page.getByRole("dialog", { name: "Set the next action" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText(`${role} at ${company}`)).toBeVisible();
  const dialogBox = await dialog.boundingBox();
  expect(dialogBox!.x + dialogBox!.width).toBeLessThanOrEqual(390);
  expect(await dialog.evaluate((node) => node.scrollWidth <= node.clientWidth)).toBe(true);
  // 30 hours back is before the start of today in any zone, so the job is
  // listed on Home whatever time of day this runs.
  await dialog.getByLabel("What is next").fill("Send the portfolio link");
  await dialog.getByLabel("When").fill(utcInputValue(-30 * 60 * 60 * 1000));
  await dialog.getByRole("button", { name: "Save" }).click();
  await expect(dialog).toBeHidden();

  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1, name: "Home" })).toBeVisible();
  await expect(page.getByRole("link", { name: `${role} at ${company}`, exact: true })).toBeVisible();
  await noSidewaysScroll("Home");

  await page.getByRole("link", { name: `${role} at ${company}`, exact: true }).click();
  await expect(page).toHaveURL(/\/jobs\//);
  await expect(page.getByRole("heading", { level: 2, name: "Fit" })).toBeVisible();
  await noSidewaysScroll("the job page");
});
