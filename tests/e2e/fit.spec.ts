import { test, expect, type Page, type TestInfo } from "@playwright/test";
import { scanForViolations } from "./axe";
import { scanInPlace } from "./scan-in-place";
import { login, uniqueName } from "./session";

// These specs own the shared account's resume and preferences, so they run
// in their own projects after every other project has finished, one engine
// at a time (playwright.config.ts). Every value here is fictional.
const E2E_RESUME = "# Resume\n\nProduct designer with eight years in internal tools and design systems.";

test.describe.configure({ mode: "serial" });

async function saveResume(page: Page, text: string) {
  await page.goto("/settings");
  await page.getByLabel("Resume").fill(text);
  await page.getByRole("button", { name: "Save profile" }).click();
  await expect(page.getByRole("region", { name: /^Notifications/ }).getByText("Profile saved.")).toBeVisible();
}

/** Clears every list, toggle and pay box, keeps the threshold at 70, and sets the locations given. */
async function savePreferences(page: Page, locations: string[]) {
  await page.goto("/preferences");
  const remove = page.getByRole("button", { name: /^Remove / });
  while ((await remove.count()) > 0) await remove.first().click();
  for (const mode of ["Remote", "Hybrid", "On site"]) {
    const toggle = page.getByRole("button", { name: mode, exact: true });
    if ((await toggle.getAttribute("aria-pressed")) === "true") await toggle.click();
  }
  await page.getByLabel("Pay floor").fill("");
  await page.getByLabel("Target pay").fill("");
  await page.getByLabel("Score threshold").fill("70");
  const field = page.getByLabel("Locations");
  for (const location of locations) {
    await field.fill(location);
    await field.press("Enter");
  }
  await page.getByRole("button", { name: "Save preferences" }).click();
  await expect(page.getByRole("region", { name: /^Notifications/ }).getByText("Preferences saved.")).toBeVisible();
}

type PostingFacts = { company: string; role: string; location: string; workMode: string; score?: string; waitMs?: number };

function postingText(p: PostingFacts): string {
  return [
    `Company: ${p.company}`,
    `Role: ${p.role}`,
    `Location: ${p.location}`,
    `Work mode: ${p.workMode}`,
    p.score ? `Fit score: ${p.score}` : null,
    p.waitMs ? `Fit wait: ${p.waitMs}` : null,
    "",
    "About the job",
    "We are looking for a designer who enjoys internal tools.",
  ]
    .filter((line) => line !== null)
    .join("\n");
}

async function addPostedJob(page: Page, facts: PostingFacts) {
  await page.goto("/board");
  await page.getByRole("button", { name: "Add job" }).first().click();
  const dialog = page.getByRole("dialog", { name: "Add a job" });
  await expect(dialog).toBeVisible();
  await dialog.getByLabel("Posting text").fill(postingText(facts));
  await dialog.getByRole("button", { name: "Add job" }).click();
  await expect(dialog).toBeHidden();
}

function jobLink(page: Page, facts: PostingFacts) {
  return page.getByRole("link", { name: `${facts.role} at ${facts.company}` }).filter({ visible: true });
}

/** The visible board card (desktop column or phone list) holding a job's link. */
function boardCard(page: Page, facts: PostingFacts) {
  return page
    .locator("div.rounded-lg.border.bg-card.p-3, li.rounded-lg.border.bg-card.p-3")
    .filter({ has: page.getByRole("link", { name: `${facts.role} at ${facts.company}` }) })
    .filter({ visible: true });
}

async function openJob(page: Page, facts: PostingFacts) {
  await page.goto("/board");
  await jobLink(page, facts).click();
  await expect(page).toHaveURL(/\/jobs\//);
  return page.getByRole("region", { name: "Fit", exact: true });
}

async function expectNoSideScroll(page: Page, testInfo: TestInfo) {
  if (testInfo.project.name !== "fit-phone") return;
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow, "page is wider than the viewport").toBeLessThanOrEqual(0);
}

const job = (testInfo: TestInfo, company: string, rest: Omit<PostingFacts, "company">): PostingFacts => ({
  company: uniqueName(testInfo, company),
  ...rest,
});

test("with no resume, the fit card asks for one and links to Settings", async ({ page }, testInfo) => {
  test.slow();
  await login(page);
  await saveResume(page, "");
  await savePreferences(page, []);

  const facts = job(testInfo, "Northwind Labs", { role: "Design Lead", location: "Rotterdam, Netherlands", workMode: "Hybrid" });
  await addPostedJob(page, facts);
  const card = await openJob(page, facts);
  await expect(card.getByText("Add your resume in Settings to get a fit score for this job.")).toBeVisible();
  await expect(card.getByRole("link", { name: "Open Settings" })).toHaveAttribute("href", "/settings");
  await expectNoSideScroll(page, testInfo);
  await scanForViolations(page, "fit card no resume", testInfo);

  await page.getByRole("region", { name: "Fit", exact: true }).getByRole("link", { name: "Open Settings" }).click();
  await expect(page).toHaveURL(/\/settings$/);
});

test("scores land on the board with their band, and a failed hard filter is named on the card and the board", async ({
  page,
}, testInfo) => {
  test.slow();
  await login(page);
  await saveResume(page, E2E_RESUME);
  await savePreferences(page, ["Rotterdam"]);

  const good = job(testInfo, "Acme Robotics", { role: "Senior Product Designer", location: "Rotterdam, Netherlands", workMode: "Hybrid", score: "81" });
  const failing = job(testInfo, "Lumen Health", { role: "Design Lead", location: "Berlin, Germany", workMode: "On site", score: "41" });
  const slow = job(testInfo, "Northwind Labs", { role: "Product Designer", location: "Rotterdam, Netherlands", workMode: "Hybrid", score: "64", waitMs: 20_000 });

  await addPostedJob(page, good);
  await addPostedJob(page, failing);
  await addPostedJob(page, slow);

  await test.step("the board shows Scoring while a score is pending, then the banded score", async () => {
    await expect(boardCard(page, slow)).toContainText("Scoring");
    await expect(boardCard(page, good).locator('[data-band="good"]')).toHaveText("Fit 81, Good fit", { timeout: 15_000 });
    await expect(boardCard(page, failing).locator('[data-band="weak"]')).toHaveText("Fit 41, Weak fit");
    await expect(boardCard(page, failing)).toContainText("Fails location");
    await expect(boardCard(page, good)).not.toContainText("Fails");
    await expectNoSideScroll(page, testInfo);
    await scanInPlace(page, "board with fit chips and scoring", testInfo);
    await expect(boardCard(page, slow)).toContainText("Scoring");
    // The board refreshes itself until the slow score is in.
    await expect(boardCard(page, slow).locator('[data-band="mixed"]')).toHaveText("Fit 64, Mixed", { timeout: 35_000 });
  });

  await test.step("a scored job shows its band, summary, pros, cons and the filter line", async () => {
    const card = await openJob(page, good);
    await expect(card.getByText("81 · Good fit")).toBeVisible();
    await expect(card.getByText("A test score from the fake driver.")).toBeVisible();
    await expect(card.getByRole("list", { name: "Pros" })).toContainText("The role matches your titles.");
    await expect(card.getByRole("list", { name: "Cons" })).toContainText("The posting does not state pay.");
    await expect(card.getByText("Passes your hard filters.")).toBeVisible();
    await expect(card.getByText(/^Scored/)).toBeVisible();
    await expectNoSideScroll(page, testInfo);
    await scanForViolations(page, "fit card scored", testInfo);
  });

  await test.step("a job that fails a hard filter is scored all the same, with the failure named", async () => {
    const card = await openJob(page, failing);
    await expect(card.getByText("41 · Weak fit")).toBeVisible();
    await expect(card.getByText("Fails 1 filter")).toBeVisible();
    await expect(card.getByText("Fails a hard filter")).toBeVisible();
    await expect(card.getByText("Location: Berlin, Germany is not in your locations.")).toBeVisible();
    await expect(card.getByText("Passes your hard filters.")).toHaveCount(0);
    await scanForViolations(page, "fit card failed hard filter", testInfo);
  });
});

test("the fit card shows Scoring while the score runs, then the result without a reload", async ({ page }, testInfo) => {
  test.slow();
  await login(page);
  const facts = job(testInfo, "Riverbend Studio", { role: "Staff Designer", location: "Rotterdam, Netherlands", workMode: "Hybrid", score: "72", waitMs: 20_000 });
  await addPostedJob(page, facts);
  const card = await openJob(page, facts);

  // Checked on both sides of the scan, so the scan provably saw this state.
  // Scoring is the job's stored state, so the reloading scan keeps it; the
  // in-place scan would wait for the placeholder's pulse to stop, which it
  // only does once the score is in.
  await expect(card.getByText("Scoring this job")).toBeVisible();
  await scanForViolations(page, "fit card scoring", testInfo);
  await expect(card.getByText("Scoring this job")).toBeVisible();
  await expect(card.getByText("72 · Good fit")).toBeVisible({ timeout: 35_000 });
});

test("a score that fails offers Score again, which reports the same failure", async ({ page }, testInfo) => {
  test.slow();
  await login(page);
  const facts = job(testInfo, "Harbor Freight Labs", { role: "UX Designer", location: "Rotterdam, Netherlands", workMode: "Hybrid", score: "fail" });
  await addPostedJob(page, facts);
  const card = await openJob(page, facts);

  const failed = "The fit score didn't come back. Nothing about the job changed.";
  await expect(card.getByText(failed)).toBeVisible({ timeout: 15_000 });
  await card.getByRole("button", { name: "Score again" }).click();
  await expect(card.getByRole("button", { name: "Score again" })).toBeVisible({ timeout: 15_000 });
  await expect(card.getByText(failed)).toBeVisible();
  await scanForViolations(page, "fit card score failed", testInfo);
});

test("the test box checks and scores a posting without adding it to the board", async ({ page }, testInfo) => {
  test.slow();
  await login(page);
  await page.goto("/preferences");
  const box = page.getByRole("region", { name: "Test against a posting" });
  await expect(box.getByText("Runs the hard filters and the fit score on one posting without adding it to the board.")).toBeVisible();

  await box.getByLabel("Posting", { exact: true }).fill("https://www.linkedin.com/jobs/view/1000000001/");
  await box.getByRole("button", { name: "Score this posting" }).click();
  await expect(box.getByRole("alert")).toHaveText(
    "This site needs a login, so Jobsmith cannot read the link. Paste the posting text instead.",
  );
  await expect(box.getByLabel("Posting text")).toBeFocused();
  await scanInPlace(page, "test box needs the posting text", testInfo);

  const facts = job(testInfo, "Northwind Labs", { role: "Design Lead", location: "Berlin, Germany", workMode: "Hybrid", score: "64" });
  await box.getByLabel("Posting text").fill(postingText(facts));
  await box.getByRole("button", { name: "Score this posting" }).click();

  const rows = box.getByRole("list", { name: "Hard filters" }).getByRole("listitem");
  await expect(rows).toHaveCount(4);
  await expect(rows.nth(1)).toContainText("Berlin, Germany is not in your locations.");
  await expect(rows.nth(1)).toContainText("Fails");
  await expect(rows.nth(2)).toContainText("No work modes set.");
  await expect(rows.nth(3)).toContainText("No pay floor set.");
  const card = box.getByRole("region", { name: "Fit", exact: true });
  await expect(card.getByText("64 · Mixed")).toBeVisible();
  await expect(card.getByText("Fails 1 filter")).toBeVisible();
  await expect(box.getByText("Nothing was added to the board.")).toBeVisible();
  await expectNoSideScroll(page, testInfo);
  await scanInPlace(page, "test box result", testInfo);

  await page.goto("/board");
  await expect(page.getByRole("link", { name: `${facts.role} at ${facts.company}` })).toHaveCount(0);
});
