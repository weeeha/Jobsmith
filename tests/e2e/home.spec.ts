import { test, expect } from "@playwright/test";
import { scanInPlace } from "./scan-in-place";
import { scanOpenMenu } from "./scan-menu";
import { addJobAndOpen, announcements, login, uniqueName, utcInputValue } from "./session";

const HOUR_MS = 60 * 60 * 1000;

test("an overdue next action shows under Today, and Snooze until tomorrow removes it and focuses Today", async ({
  page,
}, testInfo) => {
  await login(page);
  const company = uniqueName(testInfo, "Northwind Traders");
  const role = "Product Designer";
  const slug = await addJobAndOpen(page, company, role);

  // 30 hours back is before the start of today in any zone the account can
  // be in, so the item is overdue whatever time of day the suite runs.
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await page.getByLabel("What is next").fill("Send the follow-up note");
  await page.getByLabel("When").fill(utcInputValue(-30 * HOUR_MS));
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByText("Send the follow-up note")).toBeVisible();

  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1, name: "Home" })).toBeVisible();
  await expect(page.getByRole("heading", { level: 2, name: "Today" })).toBeVisible();

  // The job link and the Open job button both contain the job's name, and
  // other projects add rows to the same list, so the row is found by its
  // exact link name.
  const row = page
    .getByRole("listitem")
    .filter({ has: page.getByRole("link", { name: `${role} at ${company}`, exact: true }) });
  await expect(row).toHaveCount(1);
  await expect(row).toContainText("Send the follow-up note. Overdue since");
  await expect(row.getByRole("button", { name: `Mark the next action done for ${role} at ${company}` })).toBeVisible();

  await scanInPlace(page, "home with an overdue item", testInfo);

  const snooze = row.getByRole("button", { name: `Snooze ${role} at ${company}` });
  await snooze.click();
  await expect(page.getByRole("menuitem", { name: "Until tomorrow" })).toBeVisible();
  await scanOpenMenu(page, "home snooze menu", testInfo);

  await page.getByRole("menuitem", { name: "Until tomorrow" }).click();
  await expect(row).toHaveCount(0);
  await expect(announcements(page)).toHaveText(`Snoozed ${role} at ${company}.`);
  await expect(page.locator("#home-today")).toBeFocused();

  // The snooze moved the date and kept the text.
  await page.goto(`/jobs/${slug}`);
  await expect(page.getByText("Send the follow-up note")).toBeVisible();
});

test("a stage scheduled a day ahead shows under Today with Open prep, which opens the Prep tab", async ({
  page,
}, testInfo) => {
  await login(page);
  const company = uniqueName(testInfo, "Acme Robotics");
  const role = "Design Lead";
  await addJobAndOpen(page, company, role);

  await page.getByRole("button", { name: "Saved, current" }).click();
  const sheet = page.getByRole("dialog", { name: "Saved" });
  await expect(sheet).toBeVisible();
  await sheet.getByLabel("Date and time").fill(utcInputValue(24 * HOUR_MS));
  await sheet.getByRole("button", { name: "Save", exact: true }).click();
  await expect(sheet).toBeHidden();

  await page.goto("/");
  const row = page
    .getByRole("listitem")
    .filter({ has: page.getByRole("link", { name: `${role} at ${company}`, exact: true }) });
  await expect(row).toHaveCount(1);
  await expect(row).toContainText("Saved, ");

  await row.getByRole("link", { name: `Open prep for ${role} at ${company}` }).click();
  await expect(page).toHaveURL(/tab=prep/);
  await expect(page.getByRole("tab", { name: "Prep" })).toHaveAttribute("aria-selected", "true");
});
