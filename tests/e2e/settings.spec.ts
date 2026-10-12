import fs from "node:fs";
import { test, expect } from "@playwright/test";
import { E2E_HEADLINE, E2E_RESUME } from "./account";
import { scanForViolations } from "./axe";
import { addJobAndOpen, login, uniqueName } from "./session";

test("Settings saves the profile, keeps it after a reload, and shows the time zone", async ({ page }, testInfo) => {
  await login(page);
  await page.goto("/settings");

  await expect(page.getByRole("heading", { level: 1, name: "Settings" })).toBeVisible();
  await expect(page.getByRole("heading", { level: 2, name: "Profile" })).toBeVisible();
  await expect(page.getByRole("heading", { level: 2, name: "API tokens" })).toBeVisible();
  await expect(page.getByRole("heading", { level: 2, name: "Export my data" })).toBeVisible();

  await page.getByLabel("Headline").fill(E2E_HEADLINE);
  await page.getByLabel("Resume").fill(E2E_RESUME);
  await page.getByRole("button", { name: "Save profile" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Profile saved." })).toBeVisible();

  await page.reload();
  await expect(page.getByLabel("Headline")).toHaveValue(E2E_HEADLINE);
  await expect(page.getByLabel("Resume")).toHaveValue(E2E_RESUME);
  // The shared account stays on UTC: no spec changes its zone.
  await expect(page.getByLabel("Time zone")).toContainText("UTC");

  await scanForViolations(page, "settings profile", testInfo);
});

test("Download JSON gives a file with the user's data and no token hashes", async ({ page }, testInfo) => {
  await login(page);
  const company = uniqueName(testInfo, "Northwind Traders");
  const role = "Design Lead";
  await addJobAndOpen(page, company, role);

  await page.goto("/settings");
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("link", { name: "Download JSON" }).click(),
  ]);
  expect(download.suggestedFilename()).toMatch(/^jobsmith-export-\d{4}-\d{2}-\d{2}\.json$/);

  const filePath = await download.path();
  const text = fs.readFileSync(filePath, "utf8");
  expect(text).not.toContain("tokenHash");
  expect(text).not.toContain("dedupeHash");

  const doc = JSON.parse(text) as {
    format: string;
    companies: { name: string }[];
    opportunities: { roleTitle: string }[];
  };
  expect(doc.format).toBe("jobsmith-export/v1");
  expect(doc.companies.map((row) => row.name)).toContain(company);
  expect(doc.opportunities.map((row) => row.roleTitle)).toContain(role);
});
