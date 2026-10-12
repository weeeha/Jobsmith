import { expect, type Page, type TestInfo } from "@playwright/test";
import { E2E_HEADLINE, E2E_RESUME, EMAIL, PASSWORD } from "./account";

export function uniqueName(testInfo: TestInfo, base: string): string {
  const suffix = Math.random().toString(36).slice(2, 8);
  return `${base} ${testInfo.project.name} ${suffix}`;
}

export async function login(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(EMAIL);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Log in" }).click();
  await expect(page).toHaveURL(/\/board$/);
}

export async function addJobAndOpen(page: Page, company: string, role: string): Promise<string> {
  await page.getByRole("button", { name: "Add job" }).click();
  const dialog = page.getByRole("dialog", { name: "Add a job" });
  await expect(dialog).toBeVisible();
  await dialog.getByLabel("Company").fill(company);
  await dialog.getByLabel("Role").fill(role);
  await dialog.getByRole("button", { name: "Add job" }).click();
  await expect(dialog).toBeHidden();
  await page.getByRole("link", { name: `${role} at ${company}` }).click();
  await expect(page).toHaveURL(/\/jobs\//);

  const slug = new URL(page.url()).pathname.split("/").filter(Boolean).pop();
  if (!slug) {
    throw new Error(`addJobAndOpen: could not read a slug from ${page.url()}`);
  }
  return slug;
}

// Adds a job from the board's dialog and stays on the board.
export async function addJobOnBoard(page: Page, company: string, role: string) {
  await page.getByRole("button", { name: "Add job" }).click();
  const dialog = page.getByRole("dialog", { name: "Add a job" });
  await expect(dialog).toBeVisible();
  await dialog.getByLabel("Company").fill(company);
  await dialog.getByLabel("Role").fill(role);
  await dialog.getByRole("button", { name: "Add job" }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByRole("link", { name: `${role} at ${company}` })).toBeVisible();
}

// Saves the shared account's profile text. Every spec that needs a resume
// saves these same two values, so concurrent projects never wipe each other's.
export async function saveE2eProfile(page: Page) {
  await page.goto("/settings");
  await page.getByLabel("Headline").fill(E2E_HEADLINE);
  await page.getByLabel("Resume").fill(E2E_RESUME);
  await page.getByRole("button", { name: "Save profile" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Profile saved." })).toBeVisible();
}

// A datetime-local value in the profile zone. The shared account stays on
// UTC, so this reads the UTC wall clock and no local getters.
export function utcInputValue(offsetMs: number): string {
  return new Date(Date.now() + offsetMs).toISOString().slice(0, 16);
}

// The live region the app announces into (not the toast region).
export function announcements(page: Page) {
  return page.locator('div[role="status"][aria-live="polite"].sr-only');
}
