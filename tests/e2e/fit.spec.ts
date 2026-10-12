import { test, expect, type Page } from "@playwright/test";
import { scanForViolations } from "./axe";
import { announcements, login, saveE2eProfile, uniqueName } from "./session";

function postingWithScore(company: string, role: string, score: string): string {
  return `Company: ${company}\nRole: ${role}\nFit score: ${score}\n\nAbout the job\nWe are looking for a designer who enjoys internal tools.`;
}

async function addPostedJob(page: Page, posting: string) {
  await page.goto("/board");
  await page.getByRole("button", { name: "Add job" }).click();
  const dialog = page.getByRole("dialog", { name: "Add a job" });
  await expect(dialog).toBeVisible();
  await dialog.getByLabel("Posting text").fill(posting);
  await dialog.getByRole("button", { name: "Add job" }).click();
  await expect(dialog).toBeHidden();
}

test("a job added with a posting is scored after the response, and the score shows on the card, the header and the board", async ({
  page,
}, testInfo) => {
  test.slow();
  await login(page);
  await saveE2eProfile(page);

  const company = uniqueName(testInfo, "Northwind Traders");
  const role = "Product Designer";
  await addPostedJob(page, postingWithScore(company, role, "81"));

  // Open the job at once: the fit card polls while the score is pending.
  await page.getByRole("link", { name: `${role} at ${company}` }).click();
  await expect(page).toHaveURL(/\/jobs\//);

  const card = page.getByRole("region", { name: "Fit", exact: true });
  await expect(card.getByText("Fit score 81, strong fit")).toBeVisible({ timeout: 20_000 });
  await expect(card.getByText("A test score from the fake driver.")).toBeVisible();
  await expect(card.getByText("Above your good-fit line of 70.")).toBeVisible();
  await expect(card.getByRole("heading", { level: 3, name: "Why it fits" })).toBeVisible();
  await expect(card.getByRole("button", { name: "Score again" })).toBeVisible();

  // The header chip sits beside the title.
  const title = page.getByRole("heading", { level: 1 });
  await expect(title.locator("..").getByText("Fit score 81, strong fit")).toBeVisible();

  await scanForViolations(page, "job page with a fit score", testInfo);

  await page.goto("/board");
  const boardCard = page.getByRole("link", { name: `${role} at ${company}` });
  await expect(boardCard).toBeVisible();
  const boardRow = page
    .getByRole("region", { name: "Board columns" })
    .locator("div.rounded-lg.border")
    .filter({ has: boardCard });
  await expect(boardRow.getByText("Fit score 81, strong fit")).toHaveCount(1);
  await expect(boardRow).toContainText("81");
});

test("a failed score shows the failed line, and Try again keeps it failed and says so", async ({ page }, testInfo) => {
  test.slow();
  await login(page);
  await saveE2eProfile(page);

  const company = uniqueName(testInfo, "Lumen Health");
  const role = "Design Lead";
  await addPostedJob(page, postingWithScore(company, role, "fail"));
  await page.getByRole("link", { name: `${role} at ${company}` }).click();
  await expect(page).toHaveURL(/\/jobs\//);

  const card = page.getByRole("region", { name: "Fit", exact: true });
  const failedLine = "Scoring did not work this time. The job is saved as it is.";
  await expect(card.getByText(failedLine)).toBeVisible({ timeout: 20_000 });

  const retry = card.getByRole("button", { name: "Try again" });
  await retry.click();
  await expect(announcements(page)).toHaveText(failedLine);
  await expect(card.getByText(failedLine)).toBeVisible();
  await expect(retry).toBeFocused();

  await scanForViolations(page, "job page with a failed score", testInfo);
});
