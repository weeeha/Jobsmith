import { test, expect } from "@playwright/test";
import { scanForViolations } from "./axe";
import { scanOpenOverlay } from "./scan-open";
import { login, uniqueName, addJobAndOpen } from "./session";

test("desktop: the sidebar lists six sections, Companies shows a job under its company, and the holding pages render", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name === "phone", "desktop nav only; the phone project has its own test below");

  await login(page);

  const sidebar = page.getByRole("navigation", { name: "Sidebar" });
  await expect(sidebar.getByRole("link")).toHaveText(["Home", "Board", "Companies", "Library", "Preferences", "Settings"]);

  const company = uniqueName(testInfo, "Beacon Robotics");
  const role = "Staff Product Designer";
  const slug = await addJobAndOpen(page, company, role);

  await page.goto("/companies");
  await expect(page.getByRole("heading", { level: 1, name: "Companies" })).toBeVisible();

  const companyItem = page
    .getByRole("listitem")
    .filter({ has: page.getByRole("heading", { level: 2, name: company }) });
  await expect(companyItem).toBeVisible();
  const jobLink = companyItem.getByRole("link", { name: role });
  await expect(jobLink).toHaveAttribute("href", `/jobs/${slug}`);
  // A freshly added job starts in the Saved stage, so its stage label reads
  // "Saved" rather than the word "Closed" a closed job would show instead.
  await expect(companyItem).toContainText("Saved");

  await scanForViolations(page, "companies", testInfo);

  await page.goto("/library");
  await expect(page.getByRole("heading", { level: 1, name: "Library" })).toBeVisible();
  await expect(page.getByText("Your library comes with interview prep.")).toBeVisible();
  await expect(
    page.getByText("Stories, pitches and question banks you reuse across jobs will live here."),
  ).toBeVisible();
  await scanForViolations(page, "library", testInfo);

  await page.goto("/preferences");
  await expect(page.getByRole("heading", { level: 1, name: "Preferences" })).toBeVisible();
  await expect(page.getByText("Preferences come with fit scoring.")).toBeVisible();
  await expect(
    page.getByText("Titles, locations, pay floor and dealbreakers will live here, and new jobs get scored against them."),
  ).toBeVisible();
  await scanForViolations(page, "preferences", testInfo);
});

test("phone: the bottom bar holds four slots, and More opens a sheet to the rest of the nav", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "phone", "phone nav only; playwright.config.ts also runs this file on the phone project");

  await login(page);

  const bottomBar = page.getByRole("navigation", { name: "Primary" });
  await expect(bottomBar.getByRole("link", { name: "Home" })).toBeVisible();
  await expect(bottomBar.getByRole("link", { name: "Board" })).toBeVisible();
  await expect(bottomBar.getByRole("link", { name: "Companies" })).toBeVisible();
  const moreButton = bottomBar.getByRole("button", { name: "More" });
  await expect(moreButton).toBeVisible();
  // Exactly four slots - no fifth link or button sneaking into the bar.
  await expect(bottomBar.locator(":scope > *")).toHaveCount(4);

  await moreButton.click();
  const sheet = page.getByRole("dialog", { name: "More" });
  await expect(sheet).toBeVisible();
  await expect(sheet.getByRole("link", { name: "Library" })).toBeVisible();
  await expect(sheet.getByRole("link", { name: "Preferences" })).toBeVisible();
  await expect(sheet.getByRole("link", { name: "Settings" })).toBeVisible();

  await scanOpenOverlay(page, "more sheet", testInfo, async () => {
    if (!(await sheet.isVisible())) {
      await moreButton.click();
    }
    await expect(sheet).toBeVisible();
  });
  await page.keyboard.press("Escape");
  await expect(sheet).toBeHidden();

  // A keyboard open (WebKit, unlike Chromium, does not focus a button on a
  // plain mouse click, so this opens the way a keyboard user actually would
  // - Tab to the button, then activate it - rather than reusing the mouse
  // click above, which would leave nothing focused for Escape to return to).
  // Escape then closes without navigating, and returns focus to the button
  // that opened the sheet rather than dropping it back to <body>.
  await moreButton.focus();
  await page.keyboard.press("Enter");
  await expect(sheet).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(sheet).toBeHidden();
  await expect(moreButton).toBeFocused();

  await moreButton.click();
  await expect(sheet).toBeVisible();
  await sheet.getByRole("link", { name: "Library" }).click();
  await expect(page).toHaveURL(/\/library$/);
  await expect(sheet).toBeHidden();
  await expect(page.getByRole("heading", { level: 1, name: "Library" })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
    await page.evaluate(() => window.innerWidth),
  );

  // The Library link in the sheet now matches the current page, so it (and
  // only it) carries aria-current="page" the next time the sheet opens.
  await moreButton.click();
  await expect(sheet).toBeVisible();
  await expect(sheet.getByRole("link", { name: "Library" })).toHaveAttribute("aria-current", "page");
  await expect(sheet.getByRole("link", { name: "Preferences" })).not.toHaveAttribute("aria-current", "page");

  await sheet.getByRole("link", { name: "Preferences" }).click();
  await expect(page).toHaveURL(/\/preferences$/);
  await expect(page.getByRole("heading", { level: 1, name: "Preferences" })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
    await page.evaluate(() => window.innerWidth),
  );

  await moreButton.click();
  await expect(sheet).toBeVisible();
  await sheet.getByRole("link", { name: "Settings" }).click();
  await expect(page).toHaveURL(/\/settings$/);

  await page.goto("/companies");
  await expect(page.getByRole("heading", { level: 1, name: "Companies" })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
    await page.evaluate(() => window.innerWidth),
  );
});
