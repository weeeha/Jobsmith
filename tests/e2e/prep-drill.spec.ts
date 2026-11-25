import { mkdir, writeFile } from "node:fs/promises";
import { test, expect, type Page, type TestInfo } from "./settled";
import { scanForViolations } from "./axe";
import { runCli } from "./cli";
import { scanInPlace } from "./scan-in-place";
import { addJobAndOpen, login, uniqueName } from "./session";
import { stubMedia } from "./stub-media";
import { stubSpeech } from "./stub-speech";
import { createToken } from "./token";

// The Drill specs run on the shared account, after the fit specs and one
// engine at a time (playwright.config.ts). Headless browsers cannot be heard,
// so speech is stubbed: each line finishes after 30 ms, and the gap is what
// the specs drive (Done, keys, or the page clock). The fixture holds seven
// questions and five of them have an answer, so a drill takes five. Every
// value here is fictional.
test.describe.configure({ mode: "serial" });

const BANK_KEY = "answers-full";
const drillUrl = (slug: string, query = "") => `/jobs/${slug}/drill?doc=job%3A${BANK_KEY}${query}`;
const FRESH = "0 solid · 0 okay · 0 shaky · 7 unmarked";

/** A job with the prep fixture pushed, the CLI logged in. */
async function setup(page: Page, testInfo: TestInfo) {
  await login(page);
  const slug = await addJobAndOpen(page, uniqueName(testInfo, "Northwind Traders"), "Design Lead");
  const origin = new URL(page.url()).origin;
  const token = await createToken(page, uniqueName(testInfo, "CLI"), testInfo);
  const configHome = testInfo.outputPath("cli-config");
  const loggedIn = await runCli(["login", "--url", origin], { configHome, input: `${token}\n` });
  expect(loggedIn.code).toBe(0);
  const pushed = await runCli(["push", slug, "--dir", "tests/fixtures/prep", "--prefix", "nwt"], { configHome });
  expect(pushed.code, pushed.stderr).toBe(0);
  return { slug, configHome };
}

/**
 * Counts the server actions a page has had answered (they are POSTs to a page
 * address, not to /api), so a spec can wait for the last write before it
 * leaves the page.
 */
function trackActions(page: Page) {
  let count = 0;
  page.on("response", (response) => {
    const request = response.request();
    if (request.method() === "POST" && !new URL(request.url()).pathname.startsWith("/api/")) count += 1;
  });
  return () => count;
}

async function start(page: Page) {
  await page.getByRole("button", { name: "Start drill" }).click();
}

/** Ask, Done, mark: the whole loop for one question. */
async function answer(page: Page, level: "Shaky" | "Okay" | "Solid") {
  await page.getByRole("button", { name: "Done" }).click();
  await page.getByRole("button", { name: level, exact: true }).click();
}

async function expectNoSideways(page: Page, label: string) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow, `${label} is wider than the viewport`).toBeLessThanOrEqual(0);
}

test("after one drill run, the next run starts with the questions marked shaky", async ({ page }, testInfo) => {
  test.slow();
  const { slug } = await setup(page, testInfo);
  await stubSpeech(page);
  const actions = trackActions(page);

  await page.goto(drillUrl(slug, "&n=3"));
  await expect(page.getByText("3 questions.")).toBeVisible();
  await start(page);
  await expect(page.getByText("Question 1 of 3")).toBeVisible();
  await answer(page, "Solid");
  await expect(page.getByText("Question 2 of 3")).toBeVisible();
  await answer(page, "Shaky");
  await expect(page.getByText("Question 3 of 3")).toBeVisible();
  await answer(page, "Okay");

  const marks = page.getByRole("list", { name: "Marks given" });
  await expect(marks).toBeVisible();
  await expect(marks.getByRole("listitem")).toHaveCount(3);
  await expect(marks.getByRole("listitem").filter({ hasText: "Why Northwind Traders?" })).toContainText("Shaky");
  await expect(marks.getByRole("listitem").filter({ hasText: "Tell me about yourself" })).toContainText("Solid");
  const shaky = page.getByRole("list", { name: "Still shaky" });
  await expect(shaky.getByRole("listitem")).toHaveCount(1);
  await expect(shaky).toContainText("Why Northwind Traders?");
  await expect(page.getByRole("link", { name: "Drill the shaky ones again" })).toBeVisible();
  // start, three marks, end.
  await expect.poll(actions).toBe(5);

  // A new Drill from the hub: the shaky question comes first.
  await page.goto(`/jobs/${slug}?tab=prep`);
  await page.getByRole("link", { name: "Drill", exact: true }).click();
  await expect(page).toHaveURL(/\/drill\?doc=/);
  await start(page);
  await expect(page.getByText(/^Question 1 of \d+/)).toBeVisible();
  await page.getByRole("button", { name: "Done" }).waitFor();
  await expect(page.getByRole("heading", { name: "Drill" })).toBeVisible();
  await expect(page.getByText(/Why Northwind Traders\?/).first()).toBeVisible();
  await expect(page.getByText(/Tell me about yourself/)).toHaveCount(0);
});

test("Drill the shaky ones again starts a session of only the shaky questions", async ({ page }, testInfo) => {
  test.slow();
  const { slug } = await setup(page, testInfo);
  await stubSpeech(page);
  const actions = trackActions(page);

  await page.goto(drillUrl(slug, "&n=3"));
  await start(page);
  await answer(page, "Shaky");
  await answer(page, "Solid");
  await answer(page, "Shaky");
  await expect.poll(actions).toBe(5);

  await page.getByRole("link", { name: "Drill the shaky ones again" }).click();
  await expect(page).toHaveURL(/only=shaky/);
  await expect(page.getByText("2 questions.")).toBeVisible();
  await start(page);
  await expect(page.getByText("Question 1 of 2")).toBeVisible();
  await answer(page, "Solid");
  await expect(page.getByText("Question 2 of 2")).toBeVisible();
  await answer(page, "Solid");
  await expect(page.getByText("Nothing is shaky now.")).toBeVisible();
  await expect(page.getByRole("link", { name: "Drill the shaky ones again" })).toHaveCount(0);
  await expect.poll(actions).toBe(9); // five from the first run, then start, two marks and end

  // No shaky question is left: the page says so instead of starting an empty drill.
  await page.goto(drillUrl(slug, "&only=shaky"));
  await expect(page.getByText(/Nothing shaky to drill/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Start drill" })).toHaveCount(0);
});

test("keyboard only: space ends the gap, 1 to 3 mark, right arrow skips", async ({ page }, testInfo) => {
  test.slow();
  const { slug } = await setup(page, testInfo);
  await stubSpeech(page);

  await page.goto(drillUrl(slug, "&n=3"));
  await page.getByRole("button", { name: "Start drill" }).focus();
  await page.keyboard.press("Enter");

  // Question 1: wait for the gap, end it with Space, mark Solid with 3.
  await expect(page.getByRole("timer")).toBeVisible();
  await page.keyboard.press("Space");
  await expect(page.getByText("Spine", { exact: true })).toBeVisible();
  await page.keyboard.press("3");

  await expect(page.getByText("Question 2 of 3")).toBeVisible();
  await expect(page.getByRole("timer")).toBeVisible();
  await page.keyboard.press("Space");
  await expect(page.getByRole("group", { name: "Mark this answer" })).toBeVisible();
  await page.keyboard.press("1");

  // Question 3: the right arrow skips with no mark.
  await expect(page.getByText("Question 3 of 3")).toBeVisible();
  await expect(page.getByRole("timer")).toBeVisible();
  await page.keyboard.press("Space");
  await expect(page.getByRole("group", { name: "Mark this answer" })).toBeVisible();
  await page.keyboard.press("ArrowRight");

  const marks = page.getByRole("list", { name: "Marks given" });
  await expect(marks.getByRole("listitem")).toHaveCount(2);
  await expect(page.getByText("2 marked, 1 skipped")).toBeVisible();
});

test("More time adds thirty seconds and the countdown fast-forwards with the clock", async ({ page }, testInfo) => {
  test.slow();
  const { slug } = await setup(page, testInfo);
  await stubSpeech(page);
  await page.clock.install();

  await page.goto(drillUrl(slug, "&n=1"));
  await start(page);
  const timer = page.getByRole("timer");
  await expect(timer).toHaveText("0:15");
  await page.getByRole("button", { name: "More time" }).click();
  await expect(timer).toHaveText("0:45");

  await page.clock.runFor(30_000);
  await expect(timer).toHaveText("0:15");
  await expect(page.getByText("Spine", { exact: true })).toHaveCount(0);
  await page.clock.runFor(15_000);
  await expect(timer).toHaveCount(0);
  await expect(page.getByText("Spine", { exact: true })).toBeVisible();
});

test("the timeline shows 'Drilled 3 questions, 1 marked solid' after the session ends", async ({ page }, testInfo) => {
  test.slow();
  const { slug } = await setup(page, testInfo);
  await stubSpeech(page);
  const actions = trackActions(page);

  await page.goto(drillUrl(slug, "&n=3"));
  await start(page);
  await answer(page, "Solid");
  await answer(page, "Shaky");
  await answer(page, "Okay");
  await expect(page.getByRole("list", { name: "Marks given" })).toBeVisible();
  await expect.poll(actions).toBe(5);

  await page.goto(`/jobs/${slug}`);
  await page.getByRole("tab", { name: "Timeline" }).click();
  await expect(page.getByText("Drilled 3 questions, 1 marked solid")).toBeVisible();
});

test("marks from Drill show on the hub's confidence summary and on Home's interview item", async ({ page }, testInfo) => {
  test.slow();
  const { slug, configHome } = await setup(page, testInfo);
  await stubSpeech(page);

  // Research exists and the stage is scheduled within three days: Home lists an interview item.
  const notes = testInfo.outputPath("people");
  await mkdir(notes, { recursive: true });
  await writeFile(`${notes}/nwt-people.md`, "# People\n\nA hiring manager who prefers short answers.\n");
  const pushed = await runCli(["push", slug, "--dir", notes, "--prefix", "nwt"], { configHome });
  expect(pushed.code, pushed.stderr).toBe(0);
  await page.goto(`/jobs/${slug}`);
  await page.getByRole("button", { name: "Saved, current" }).click();
  const sheet = page.getByRole("dialog", { name: "Saved" });
  const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000);
  const pad = (n: number) => String(n).padStart(2, "0");
  await sheet.getByLabel("Date and time").fill(`${tomorrow.getFullYear()}-${pad(tomorrow.getMonth() + 1)}-${pad(tomorrow.getDate())}T09:30`);
  await sheet.getByRole("button", { name: "Save" }).click();
  await expect(sheet).toBeHidden();

  // Counted from here: the stage sheet above is a server action too.
  const actions = trackActions(page);
  await page.goto(drillUrl(slug, "&n=3"));
  await start(page);
  await answer(page, "Solid");
  await answer(page, "Shaky");
  await answer(page, "Okay");
  await expect(page.getByRole("list", { name: "Marks given" })).toBeVisible();
  await expect.poll(actions).toBe(5);

  await page.goto(`/jobs/${slug}?tab=prep`);
  await expect(page.getByText("1 solid · 1 okay · 1 shaky · 4 unmarked")).toBeVisible();
  await expect(page.getByText(FRESH)).toHaveCount(0);

  await page.goto("/");
  // The phone layout lists an item in two places, so take the first.
  await expect(page.getByText("1 of 7 solid").first()).toBeVisible();
});

test("Record my answer: keep one recording, see it under the question on the hub, delete it", async ({ page }, testInfo) => {
  test.slow();
  const { slug } = await setup(page, testInfo);
  await stubSpeech(page);
  await stubMedia(page);
  const actions = trackActions(page);

  await page.goto(drillUrl(slug, "&n=1"));
  await start(page);
  await page.getByRole("button", { name: "Record my answer" }).click();
  await expect(page.getByText(/^Recording\./)).toBeVisible();
  await page.getByRole("button", { name: "Done" }).click();

  const panel = page.getByRole("region", { name: "Your recording" });
  await expect(panel.locator("audio")).toHaveCount(1);
  await expect(panel.getByRole("button", { name: "Discard" })).toBeVisible();
  // Nothing has left the browser yet: the only upload comes from Keep.
  const uploads: string[] = [];
  page.on("request", (request) => {
    if (request.method() === "POST" && new URL(request.url()).pathname === "/api/assets") uploads.push(request.url());
  });
  expect(uploads).toHaveLength(0);
  await panel.getByRole("button", { name: "Keep" }).click();
  await expect(page.getByText("Recording saved.").first()).toBeVisible();
  expect(uploads).toHaveLength(1);
  await page.getByRole("button", { name: "Solid", exact: true }).click();
  await expect(page.getByRole("list", { name: "Marks given" })).toBeVisible();
  await expect.poll(actions).toBeGreaterThanOrEqual(3);

  await page.goto(`/jobs/${slug}?tab=prep`);
  const row = page.getByRole("listitem").filter({ hasText: "Tell me about yourself" });
  const audio = row.locator("audio");
  await expect(audio).toHaveCount(1);
  const src = await audio.getAttribute("src");
  expect(src).toMatch(/^\/api\/assets\/[0-9a-f-]{36}$/);
  const served = await page.request.get(src!);
  expect(served.status()).toBe(200);
  expect(served.headers()["content-type"]).toBe("audio/webm");
  expect((await served.body()).length).toBe(2048);

  await row.getByRole("button", { name: /^Delete the recording/ }).click();
  await expect(row.locator("audio")).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole("listitem").filter({ hasText: "Tell me about yourself" }).locator("audio")).toHaveCount(0);
  expect((await page.request.get(src!)).status()).toBe(404);
});

test("a refused microphone hides Record my answer with a one-line reason and the drill goes on", async ({ page }, testInfo) => {
  test.slow();
  const { slug } = await setup(page, testInfo);
  await stubSpeech(page);
  await stubMedia(page, { refuse: true });

  await page.goto(drillUrl(slug, "&n=2"));
  await start(page);
  await page.getByRole("button", { name: "Record my answer" }).click();
  await expect(page.getByText("Recording is not available: the microphone was refused.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Record my answer" })).toHaveCount(0);
  await page.getByRole("button", { name: "Done" }).click();
  await page.getByRole("button", { name: "Solid", exact: true }).click();
  // The refusal holds for the next question too.
  await expect(page.getByText("Question 2 of 2")).toBeVisible();
  await expect(page.getByRole("button", { name: "Record my answer" })).toHaveCount(0);
});

test("Drill and its summary pass axe in light and dark on every project", async ({ page }, testInfo) => {
  test.slow();
  const { slug } = await setup(page, testInfo);
  await stubSpeech(page);
  await stubMedia(page);
  const phone = testInfo.project.name.endsWith("phone");

  await page.goto(`/jobs/${slug}?tab=prep`);
  await expect(page.getByText(FRESH)).toBeVisible();
  await scanForViolations(page, "prep hub with Drill links", testInfo);

  await page.goto(drillUrl(slug, "&n=2"));
  await expect(page.getByRole("button", { name: "Start drill" })).toBeVisible();
  await scanForViolations(page, "drill start", testInfo);
  if (phone) await expectNoSideways(page, "drill start");

  await start(page);
  await expect(page.getByRole("timer")).toBeVisible();
  await scanInPlace(page, "drill gap", testInfo);
  if (phone) await expectNoSideways(page, "drill gap");

  await page.getByRole("button", { name: "Record my answer" }).click();
  await page.getByRole("button", { name: "Done" }).click();
  await expect(page.getByRole("region", { name: "Your recording" })).toBeVisible();
  await scanInPlace(page, "drill reveal", testInfo);
  if (phone) await expectNoSideways(page, "drill reveal");

  await page.getByRole("button", { name: "Solid", exact: true }).click();
  await answer(page, "Shaky");
  await expect(page.getByRole("list", { name: "Marks given" })).toBeVisible();
  await scanInPlace(page, "drill summary", testInfo);
  if (phone) await expectNoSideways(page, "drill summary");
});
