import { test, expect, type Page } from "@playwright/test";
import { scanForViolations } from "./axe";
import { login } from "./session";

// Chromium and WebKit run this file at the same time against one account, so
// each test only makes sure a value is there and never removes one: whichever
// project saves last saves the same thing.

async function ensureTitle(page: Page, title: string) {
  const titles = page.getByRole("group", { name: "Job titles" });
  const remove = titles.getByRole("button", { name: `Remove ${title}` });
  if ((await remove.count()) === 0) {
    await titles.getByLabel("New entry for Job titles").fill(title);
    await page.keyboard.press("Enter");
    await expect(remove).toBeVisible();
  }
}

async function ensureRemotePressed(page: Page) {
  const remote = page.getByRole("button", { name: "Remote", exact: true });
  if ((await remote.getAttribute("aria-pressed")) !== "true") await remote.click();
  await expect(remote).toHaveAttribute("aria-pressed", "true");
}

test("Preferences keeps a title added with the keyboard and a pressed work mode after a reload", async ({ page }) => {
  await login(page);
  await page.goto("/preferences");
  await expect(page.getByRole("heading", { level: 1, name: "Preferences" })).toBeVisible();
  for (const name of ["Hard filters", "For the fit score", "Home reminders"]) {
    await expect(page.getByRole("heading", { level: 2, name })).toBeVisible();
  }

  await ensureTitle(page, "Product Designer");
  await ensureRemotePressed(page);
  await page.getByRole("button", { name: "Save preferences" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Preferences saved." })).toBeVisible();

  await page.reload();
  await expect(
    page.getByRole("group", { name: "Job titles" }).getByRole("button", { name: "Remove Product Designer" }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Remote", exact: true })).toHaveAttribute("aria-pressed", "true");
});

test("Preferences shows the size range error under the field and returns focus to Save preferences", async ({
  page,
}) => {
  await login(page);
  await page.goto("/preferences");

  await page.getByLabel("Company size from").fill("50");
  await page.getByLabel("Company size to").fill("10");
  await page.getByRole("button", { name: "Save preferences" }).click();

  await expect(page.getByText("The smallest size must not be above the largest.")).toBeVisible();
  await expect(page.getByLabel("Company size to")).toHaveAttribute("aria-invalid", "true");
  await expect(page.getByRole("alert")).toHaveText("Check the highlighted fields.");
  await expect(page.getByRole("button", { name: "Save preferences" })).toBeFocused();
});

test("Preferences has no accessibility violations", async ({ page }, testInfo) => {
  await login(page);
  await page.goto("/preferences");
  await expect(page.getByRole("heading", { level: 1, name: "Preferences" })).toBeVisible();
  await scanForViolations(page, "preferences form", testInfo);
});
