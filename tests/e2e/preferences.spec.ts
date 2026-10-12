import { test, expect, type Page } from "@playwright/test";
import { scanForViolations } from "./axe";
import { scanInPlace } from "./scan-in-place";
import { login, saveE2eProfile } from "./session";

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
  // Next's route announcer is a second element with role "alert", so the
  // alert is found by its text.
  await expect(page.getByRole("alert").filter({ hasText: "Check the highlighted fields." })).toHaveText(
    "Check the highlighted fields.",
  );
  await expect(page.getByRole("button", { name: "Save preferences" })).toBeFocused();
});

test("Preferences has no accessibility violations", async ({ page }, testInfo) => {
  await login(page);
  await page.goto("/preferences");
  await expect(page.getByRole("heading", { level: 1, name: "Preferences" })).toBeVisible();
  await scanForViolations(page, "preferences form", testInfo);
});

test("Test against a posting scores a pasted posting with the saved preferences and saves nothing", async ({
  page,
}, testInfo) => {
  test.slow();
  await login(page);
  await saveE2eProfile(page);

  await page.goto("/preferences");
  await ensureTitle(page, "Product Designer");
  await page.getByRole("button", { name: "Save preferences" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Preferences saved." })).toBeVisible();

  const box = page.getByRole("region", { name: "Test against a posting" });
  await box.getByRole("button", { name: "Test" }).click();
  await expect(box.getByText("Paste a link or the posting text.")).toBeVisible();
  await expect(box.getByLabel("Posting text")).toHaveAttribute("aria-invalid", "true");

  await box.getByLabel("Posting text").fill(
    "Company: Northwind Traders\nRole: Product Designer\nFit score: 81\n\nAbout the job\nWe are looking for a designer who enjoys internal tools.",
  );
  await box.getByRole("button", { name: "Test" }).click();

  const result = box.getByRole("region", { name: "Result" });
  await expect(result).toBeVisible({ timeout: 30_000 });
  await expect(result.getByText("Product Designer at Northwind Traders")).toBeVisible();
  await expect(result.getByText("Fit score 81, strong fit")).toBeVisible();
  await expect(result.getByText("Passes your hard filters.")).toBeVisible();
  await expect(box.getByRole("button", { name: "Test" })).toBeFocused();

  await scanInPlace(page, "preferences test box result", testInfo);

  // Nothing was saved: the board has no job for this posting.
  await page.goto("/board");
  await expect(page.getByRole("link", { name: "Product Designer at Northwind Traders", exact: true })).toHaveCount(0);
});
