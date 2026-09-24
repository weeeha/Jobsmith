import { expect, type Page, type TestInfo } from "@playwright/test";
import { EMAIL, PASSWORD } from "./account";

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
