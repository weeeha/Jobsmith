import { test, expect, type Locator, type Page, type TestInfo } from "@playwright/test";
import { scanForViolations } from "./axe";
import { runCli } from "./cli";
import { deleteQuestionRows } from "./db";
import { addJobAndOpen, login, uniqueName } from "./session";
import { createToken } from "./token";

// These specs push documents and write marks on the shared account, so they
// run in their own projects after the fit specs, one engine at a time
// (playwright.config.ts). Every value here is fictional.
test.describe.configure({ mode: "serial" });

const SUMMARY_FRESH = "0 solid · 0 okay · 0 shaky · 7 unmarked";

/** Adds a job, makes a token, and logs the CLI in. Returns what a spec needs to push. */
async function setup(page: Page, testInfo: TestInfo) {
  await login(page);
  const slug = await addJobAndOpen(page, uniqueName(testInfo, "Northwind Traders"), "Design Lead");
  const origin = new URL(page.url()).origin;
  const token = await createToken(page, uniqueName(testInfo, "CLI"), testInfo);
  const configHome = testInfo.outputPath("cli-config");
  const loggedIn = await runCli(["login", "--url", origin], { configHome, input: `${token}\n` });
  expect(loggedIn.code).toBe(0);

  async function push(dir: string, prefix: string) {
    const result = await runCli(["push", slug, "--dir", dir, "--prefix", prefix], { configHome });
    expect(result.code, result.stderr).toBe(0);
    return result;
  }
  return { slug, push };
}

function questionRow(scope: Page | Locator, text: string) {
  return scope.getByRole("listitem").filter({ hasText: text });
}

test("a pushed answers-full file shows as rows grouped by section with the unfilled ones flagged", async ({ page }, testInfo) => {
  test.slow();
  const { slug, push } = await setup(page, testInfo);
  await push("tests/fixtures/prep", "nwt");

  await page.goto(`/jobs/${slug}?tab=prep`);
  const questions = page.getByRole("region", { name: /^Questions:/ });
  await expect(questions.getByRole("heading", { name: "Motivation" })).toBeVisible();
  await expect(questions.getByRole("heading", { name: "Craft" })).toBeVisible();
  await expect(questions.getByRole("listitem")).toHaveCount(7);

  await expect(questionRow(questions, "A hard decision").getByText("unfilled", { exact: true })).toBeVisible();
  await expect(questionRow(questions, "Walk me through a project").getByText("unfilled", { exact: true })).toBeVisible();
  await expect(questions.getByText("unfilled", { exact: true })).toHaveCount(2);
  await expect(page.getByText(SUMMARY_FRESH)).toBeVisible();
});

test("a mark survives a second push of a changed file", async ({ page }, testInfo) => {
  test.slow();
  const { slug, push } = await setup(page, testInfo);
  await push("tests/fixtures/prep", "nwt");

  await page.goto(`/jobs/${slug}?tab=prep`);
  const first = questionRow(page, "Tell me about yourself");
  await first.getByText("Mark", { exact: true }).click();
  await first.getByRole("button", { name: "Solid" }).click();
  await expect(first.getByRole("button", { name: "Solid" })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByText("1 solid · 0 okay · 0 shaky · 6 unmarked")).toBeVisible();

  const second = await push("tests/fixtures/prep/v2", "nwt");
  expect(second.stdout).toContain("1 versioned");
  await page.reload();
  await expect(page.getByText("1 solid · 0 okay · 0 shaky · 6 unmarked")).toBeVisible();
  const again = questionRow(page, "Tell me about yourself");
  await expect(again.locator('[data-level="solid"]')).toBeVisible();

  const third = await push("tests/fixtures/prep/v2", "nwt");
  expect(third.stdout).toContain("0 created, 0 versioned, 0 updated, 1 unchanged.");
});

test("a Quick-fire round runs with no audio", async ({ page }, testInfo) => {
  test.slow();
  const { slug, push } = await setup(page, testInfo);
  await push("tests/fixtures/prep", "nwt");

  // Nothing in this flow plays sound: fail the spec if the page asks for any.
  let audioRequests = 0;
  page.on("request", (req) => {
    if (req.resourceType() === "media") audioRequests += 1;
  });

  await page.goto(`/jobs/${slug}?tab=prep`);
  await page.getByRole("link", { name: "Quick-fire" }).click();
  await expect(page).toHaveURL(/\/quick-fire/);

  const progress = page.getByText(/^Question 1 of \d+$/);
  await expect(progress).toBeVisible();
  const total = Number((await progress.innerText()).match(/of (\d+)/)![1]);
  expect(total).toBeGreaterThan(0);

  for (let position = 1; position <= total; position += 1) {
    await expect(page.getByText(`Question ${position} of ${total}`)).toBeVisible();
    // The Spine appears when the five-second count ends.
    await expect(page.getByText("Spine", { exact: true })).toBeVisible({ timeout: 15_000 });
    await page.getByRole("button", { name: "Next question" }).click();
  }

  await expect(page.getByRole("heading", { name: "This round" })).toBeVisible();
  expect(audioRequests).toBe(0);
  await expect(page.locator("audio")).toHaveCount(0);

  // The timeline event is written when the summary opens.
  await expect(async () => {
    await page.goto(`/jobs/${slug}?tab=timeline`);
    await expect(page.getByText(`Drilled ${total} ${total === 1 ? "question" : "questions"}, 0 marked solid`)).toBeVisible({
      timeout: 2_000,
    });
  }).toPass({ timeout: 20_000 });
});

test("the packet files show the no-questions notice and nothing for the call card", async ({ page }, testInfo) => {
  test.slow();
  const { slug, push } = await setup(page, testInfo);
  await push("tests/fixtures/packet", "nwl");

  const notice =
    'This document has no questions Jobsmith can read. A question is a line like `### 1. "Tell me about yourself"`.';

  // On its own the packet holds no readable question: each question bank still
  // gets its card with the notice, and the call card gets none.
  await page.goto(`/jobs/${slug}?tab=prep`);
  await expect(page.locator('[data-bank-key="answers-full"]').getByText(notice)).toBeVisible();
  await expect(page.locator('[data-bank-key="hr-bank"]').getByText(notice)).toBeVisible();
  await expect(page.locator('[data-bank-key="call-card"]')).toHaveCount(0);

  // Next to a bank that has questions the notice stays on the others. The prep
  // fixture shares the key answers-full with the packet's file, so it replaces
  // that one with a version that has questions; the packet's hr-bank has none.
  await push("tests/fixtures/prep", "nwt");
  await page.goto(`/jobs/${slug}?tab=prep`);
  const noQuestions = page.locator('[data-bank-key="hr-bank"]');
  await expect(noQuestions).toBeVisible();
  await expect(noQuestions.getByText(notice)).toBeVisible();
  await expect(page.locator('[data-bank-key="call-card"]')).toHaveCount(0);
});

test("the hub, Quick-fire and the empty state pass axe in light and dark", async ({ page }, testInfo) => {
  test.slow();
  const { slug, push } = await setup(page, testInfo);

  await page.goto(`/jobs/${slug}?tab=prep`);
  await expect(page.getByText("No prep yet. Push a question bank or paste one.")).toBeVisible();
  await scanForViolations(page, "prep empty state", testInfo);

  await push("tests/fixtures/prep", "nwt");
  await page.goto(`/jobs/${slug}?tab=prep`);
  await expect(page.getByText(SUMMARY_FRESH)).toBeVisible();
  await scanForViolations(page, "prep hub", testInfo);

  await page.goto(`/jobs/${slug}/quick-fire`);
  await expect(page.getByTestId("quick-fire-count")).toBeVisible();
  await scanForViolations(page, "quick-fire", testInfo);
});

test("Rebuild questions restores rows deleted behind the app's back", async ({ page }, testInfo) => {
  test.slow();
  const { slug, push } = await setup(page, testInfo);
  await push("tests/fixtures/prep", "nwt");

  await page.goto(`/jobs/${slug}?tab=prep`);
  await expect(page.getByRole("region", { name: /^Questions:/ }).getByRole("listitem")).toHaveCount(7);

  expect(await deleteQuestionRows(slug)).toBe(7);
  await page.reload();
  await expect(page.getByRole("region", { name: /^Questions:/ })).toHaveCount(0);

  await page.getByRole("button", { name: "Rebuild questions" }).click();
  await expect(page.getByRole("region", { name: /^Questions:/ }).getByRole("listitem")).toHaveCount(7);
  await expect(page.getByRole("button", { name: "Rebuild questions" })).toHaveCount(0);
});
