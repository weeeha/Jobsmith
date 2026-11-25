import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { test, expect, type Page, type TestInfo } from "./settled";
import { scanForViolations } from "./axe";
import { runCli } from "./cli";
import { scanInPlace } from "./scan-in-place";
import { addJobAndOpen, login, uniqueName } from "./session";
import { stubSpeech, type StubWindow } from "./stub-speech";
import { createToken } from "./token";

// The Library specs run on the shared account, after the fit specs and one
// engine at a time (playwright.config.ts matches prep-*.spec.ts). Every
// question carries a token that is unique to the test, so its item, its
// marks and its job count never mix with another spec's, whatever else the
// shared library holds. Speech is stubbed (headless browsers cannot be
// heard) and the server's voice is the fake driver, so clips are silent.
// Every value here is fictional.
test.describe.configure({ mode: "serial" });

type Setup = { configHome: string; origin: string };

/** A token for the CLI, logged in once per test. */
async function setup(page: Page, testInfo: TestInfo): Promise<Setup> {
  await login(page);
  const origin = new URL(page.url()).origin;
  const token = await createToken(page, uniqueName(testInfo, "CLI"), testInfo);
  const configHome = testInfo.outputPath("cli-config");
  const loggedIn = await runCli(["login", "--url", origin], { configHome, input: `${token}\n` });
  expect(loggedIn.code).toBe(0);
  return { configHome, origin };
}

/** A bank of `count` answered questions, each titled with the test's own token. */
async function writeBank(testInfo: TestInfo, token: string, count = 3): Promise<string> {
  const dir = testInfo.outputPath(`bank-${token.replace(/\W+/g, "-")}`);
  await mkdir(dir, { recursive: true });
  const body = Array.from(
    { length: count },
    (_, i) =>
      `### ${i + 1}. "Tell me about ${token} ${i + 1}"\n\n**Say:** I design orders number ${i + 1} for ${token}.\n\n**Spine:** Craft ${i + 1}, then range.\n`,
  ).join("\n");
  await writeFile(path.join(dir, "lib-answers-full.md"), `# Library bank\n\n## Opening\n\n${body}`);
  return dir;
}

const questionOf = (token: string, n: number) => `Tell me about ${token} ${n}`;

/** Adds a job on the board, pushes the bank and returns the job's slug and company. */
async function addJobWithBank(page: Page, testInfo: TestInfo, s: Setup, dir: string, label = "Northwind Traders") {
  await page.goto("/board");
  const company = uniqueName(testInfo, label);
  const slug = await addJobAndOpen(page, company, "Design Lead");
  const pushed = await runCli(["push", slug, "--dir", dir, "--prefix", "lib"], { configHome: s.configHome });
  expect(pushed.code, pushed.stderr).toBe(0);
  return { slug, company };
}

function row(page: Page, text: string) {
  return page.getByRole("listitem").filter({ hasText: text });
}

/** Marks one question from the hub's disclosure. */
async function markOnHub(page: Page, slug: string, question: string, level: "Shaky" | "Okay" | "Solid") {
  await page.goto(`/jobs/${slug}?tab=prep`);
  const r = row(page, question);
  await r.getByText("Mark", { exact: true }).click();
  await r.getByRole("button", { name: level, exact: true }).click();
  await expect(r.getByRole("button", { name: level, exact: true })).toHaveAttribute("aria-pressed", "true");
}

/** Saves one question to the library from the hub and opens the new item through the toast. */
async function saveFromHub(page: Page, slug: string, question: string) {
  await page.goto(`/jobs/${slug}?tab=prep`);
  const r = row(page, question);
  await r.getByText("Mark", { exact: true }).click();
  await r.getByRole("button", { name: /^Save to library/ }).click();
  await expect(page.getByText("Saved to library.").first()).toBeVisible();
  await page.getByRole("link", { name: "Open", exact: true }).click();
  await expect(page).toHaveURL(/\/library\/[0-9a-f-]{36}$/);
  await expect(page.getByRole("heading", { level: 1, name: question })).toBeVisible();
  return page.url();
}

/**
 * Runs the Library drill to its summary. Whatever else the shared library
 * holds comes up too, so the loop marks those Solid and gives only the item
 * under test the level the spec asked for.
 */
async function drillLibrary(page: Page, title: string, level: "Shaky" | "Okay" | "Solid") {
  const ensured = page.waitForResponse((r) => r.request().method() === "POST" && r.url().includes("/library/drill"));
  await page.goto("/library/drill?n=50");
  await ensured;
  await page.getByRole("button", { name: "Start drill" }).click();
  const summary = page.getByRole("list", { name: "Marks given" });
  const done = page.getByRole("button", { name: "Done" });
  for (let i = 0; i < 60; i += 1) {
    await expect(done.or(summary)).toBeVisible({ timeout: 20_000 });
    if (await summary.isVisible()) return;
    const isTarget = (await page.getByText(title, { exact: true }).count()) > 0;
    await done.click();
    await page.getByRole("button", { name: isTarget ? level : "Solid", exact: true }).click();
  }
  throw new Error("The Library drill did not reach its summary in 60 questions.");
}

async function expectNoSideways(page: Page, label: string) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow, `${label} is wider than the viewport`).toBeLessThanOrEqual(0);
}

test("an answer saved from one job drills from the Library", async ({ page }, testInfo) => {
  test.slow();
  const s = await setup(page, testInfo);
  await stubSpeech(page);
  const token = uniqueName(testInfo, "Aurora");
  const { slug, company } = await addJobWithBank(page, testInfo, s, await writeBank(testInfo, token));
  const question = questionOf(token, 1);

  const itemUrl = await saveFromHub(page, slug, question);
  await expect(page.getByText("Used in 1 job")).toBeVisible();
  await expect(page.getByRole("link", { name: new RegExp(`^${company}, Design Lead$`) })).toBeVisible();

  // The Library lists it.
  await page.goto(`/library?q=${encodeURIComponent(token)}`);
  await expect(page.getByRole("link", { name: question })).toBeVisible();

  // The drill asks it, and a Shaky mark reaches the summary.
  await drillLibrary(page, question, "Shaky");
  const marks = page.getByRole("list", { name: "Marks given" });
  await expect(marks.getByRole("listitem").filter({ hasText: question })).toContainText("Shaky");
  await expect(page.getByRole("list", { name: "Still shaky" })).toContainText(question);
  await expect(page.getByRole("link", { name: "Drill the shaky ones again" })).toHaveAttribute("href", "/library/drill?only=shaky");
  // The answer was spoken from a clip made on demand, not only the browser voice.
  const plays = await page.evaluate(() => (window as unknown as StubWindow).__plays);
  expect(plays.some((p) => p.src.startsWith("/api/assets/"))).toBe(true);

  // The item's page now shows the library mark.
  await expect(async () => {
    await page.goto(itemUrl);
    await expect(page.getByRole("heading", { name: "Marks by job" })).toBeVisible();
    await expect(page.getByRole("listitem").filter({ hasText: "Library drill" })).toContainText("Shaky");
  }).toPass({ timeout: 20_000 });
  await expect(page.getByRole("listitem").filter({ hasText: "Library drill" })).toContainText("drilled 1 time");

  // A library session leaves no event on the job's timeline.
  await page.goto(`/jobs/${slug}?tab=timeline`);
  await expect(page.getByText(/^Drilled \d+ questions?/)).toHaveCount(0);
});

test("jobsmith pull lists each question's mark", async ({ page }, testInfo) => {
  test.slow();
  const s = await setup(page, testInfo);
  const token = uniqueName(testInfo, "Borealis");
  const { slug } = await addJobWithBank(page, testInfo, s, await writeBank(testInfo, token));
  await markOnHub(page, slug, questionOf(token, 1), "Solid");
  await markOnHub(page, slug, questionOf(token, 2), "Shaky");
  await saveFromHub(page, slug, questionOf(token, 1));

  const out = testInfo.outputPath("pulled");
  const pulled = await runCli(["pull", slug, "--out", out], { configHome: s.configHome });
  expect(pulled.code, pulled.stderr).toBe(0);
  const context = await readFile(path.join(out, `${slug}-context.md`), "utf8");

  expect(context).toContain("jobsmith: context/v1");
  expect(context).toContain("## Prep");
  expect(context).toContain("### Library bank (answers-full)");
  expect(context).toContain(`- 1. ${questionOf(token, 1)}. Section: Opening. Mark: solid. Last drilled: never.`);
  expect(context).toContain(`- 2. ${questionOf(token, 2)}. Section: Opening. Mark: shaky. Last drilled: never.`);
  expect(context).toContain(`- 3. ${questionOf(token, 3)}. Section: Opening. Mark: none. Last drilled: never.`);
  expect(context).toContain("## Library");
  expect(context).toContain(`- ${questionOf(token, 1)} (answer). Tags: none.`);
  // Labels and marks only: never an answer or a Spine.
  expect(context).not.toContain(`I design orders number 1 for ${token}`);
  expect(context).not.toContain("Craft 1, then range");
});

test("search, filter by kind and tag, edit, archive and unarchive", async ({ page }, testInfo) => {
  test.slow();
  await login(page);
  const token = uniqueName(testInfo, "Cinder");
  const first = `A story about ${token}`;
  const second = `A fact about ${token}`;

  async function create(kind: "Story" | "Intro" | "Fact", title: string, body: string, tag: string) {
    await page.goto("/library");
    await page.getByRole("button", { name: "New item" }).click();
    const dialog = page.getByRole("dialog", { name: "New library item" });
    await dialog.getByLabel("Kind").selectOption({ label: kind });
    await dialog.getByLabel("Title").fill(title);
    await dialog.getByLabel("Body").fill(body);
    await dialog.getByLabel("Tags").fill(tag);
    await page.keyboard.press("Enter");
    await dialog.getByRole("button", { name: "Create item" }).click();
    await expect(dialog).toBeHidden();
  }
  await create("Story", first, "A shop owner who kept orders on paper.", `tag-${token.split(" ").at(-1)}`);
  await create("Fact", second, "Eight designers across two time zones.", "numbers");

  await page.goto(`/library?q=${encodeURIComponent(token)}`);
  await expect(page.getByRole("link", { name: first })).toBeVisible();
  await expect(page.getByRole("link", { name: second })).toBeVisible();

  // Search on the form, then the kind filter and the tag filter.
  await page.getByRole("searchbox", { name: "Search" }).fill("paper");
  await page.getByRole("button", { name: "Filter" }).click();
  await expect(page).toHaveURL(/q=paper/);
  await expect(page.getByRole("link", { name: first })).toBeVisible();
  await expect(page.getByRole("link", { name: second })).toHaveCount(0);

  await page.goto(`/library?q=${encodeURIComponent(token)}&kind=fact`);
  await expect(page.getByRole("link", { name: second })).toBeVisible();
  await expect(page.getByRole("link", { name: first })).toHaveCount(0);
  await page.goto(`/library?q=${encodeURIComponent(token)}&tag=numbers`);
  await expect(page.getByRole("link", { name: second })).toBeVisible();
  await expect(page.getByRole("link", { name: first })).toHaveCount(0);
  await page.goto(`/library?q=nothing-matches-${encodeURIComponent(token)}`);
  await expect(page.getByText("No items match.")).toBeVisible();

  // Edit the fact.
  await page.goto(`/library?q=${encodeURIComponent(token)}&kind=fact`);
  await page.getByRole("link", { name: second }).click();
  await page.getByRole("button", { name: `Edit ${second}` }).click();
  await page.getByLabel("Title").fill(`${second}, edited`);
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByRole("heading", { level: 1, name: `${second}, edited` })).toBeVisible();

  // Archive: gone from the list, there under Show archived, then restored.
  await page.getByRole("button", { name: "Archive" }).click();
  await expect(page.getByText("This item is archived.")).toBeVisible();
  await page.goto(`/library?q=${encodeURIComponent(token)}&kind=fact`);
  await expect(page.getByText("No items match.")).toBeVisible();
  await page.goto(`/library?q=${encodeURIComponent(token)}&kind=fact&archived=1`);
  const archived = page.getByRole("link", { name: `${second}, edited` });
  await expect(archived).toBeVisible();
  await archived.click();
  await page.getByRole("button", { name: "Restore" }).click();
  await expect(page.getByText("This item is archived.")).toHaveCount(0);
  await page.goto(`/library?q=${encodeURIComponent(token)}&kind=fact`);
  await expect(page.getByRole("link", { name: `${second}, edited` })).toBeVisible();
});

test("a story created by hand shows in the list and can be edited", async ({ page }, testInfo) => {
  test.slow();
  await login(page);
  const token = uniqueName(testInfo, "Dunmore");
  const title = `The ${token} story`;
  await page.goto("/library");
  await page.getByRole("button", { name: "New item" }).click();
  const dialog = page.getByRole("dialog", { name: "New library item" });
  // A story is the dialog's default kind.
  await expect(dialog.getByLabel("Kind")).toHaveValue("story");
  // A title is required: the dialog stays open and says so.
  await dialog.getByRole("button", { name: "Create item" }).click();
  await expect(dialog.getByText("Give the item a title.")).toBeVisible();
  await dialog.getByLabel("Title").fill(title);
  await dialog.getByLabel("Body").fill("A baker who counted loaves in a notebook.");
  await dialog.getByRole("button", { name: "Create item" }).click();
  await expect(dialog).toBeHidden();

  await page.goto(`/library?q=${encodeURIComponent(token)}`);
  const link = page.getByRole("link", { name: title });
  await expect(link).toBeVisible();
  await expect(page.getByText("A baker who counted loaves in a notebook.")).toBeVisible();
  await link.click();
  await page.getByRole("button", { name: `Edit ${title}` }).click();
  await page.getByLabel("Title").fill(`${title} again`);
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByRole("heading", { level: 1, name: `${title} again` })).toBeVisible();
  // A story has no question, so there is nothing to count or mark.
  await expect(page.getByText(/^Used in/)).toHaveCount(0);
});

test("Library Quick-fire runs a round over jobs and the library", async ({ page }, testInfo) => {
  test.slow();
  const s = await setup(page, testInfo);
  const token = uniqueName(testInfo, "Ember");
  const { slug } = await addJobWithBank(page, testInfo, s, await writeBank(testInfo, token));

  // Nothing in this flow plays sound.
  let audioRequests = 0;
  page.on("request", (req) => {
    if (req.resourceType() === "media") audioRequests += 1;
  });

  await page.goto("/library");
  await page.getByRole("link", { name: "Quick-fire" }).click();
  await expect(page).toHaveURL(/\/library\/quick-fire$/);
  await expect(page.getByRole("heading", { level: 1, name: "Quick-fire" })).toBeVisible();

  const progress = page.getByText(/^Question 1 of \d+$/);
  await expect(progress).toBeVisible();
  const total = Number((await progress.innerText()).match(/of (\d+)/)![1]);
  expect(total).toBeGreaterThanOrEqual(3);
  expect(total).toBeLessThanOrEqual(10);

  for (let position = 1; position <= total; position += 1) {
    await expect(page.getByText(`Question ${position} of ${total}`)).toBeVisible();
    await expect(page.getByText("Spine", { exact: true })).toBeVisible({ timeout: 15_000 });
    if (position === 1) await page.getByRole("button", { name: "Okay", exact: true }).click();
    await page.getByRole("button", { name: "Next question" }).click();
  }
  await expect(page.getByRole("heading", { name: "This round" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Back to Library" })).toHaveAttribute("href", "/library");
  expect(audioRequests).toBe(0);
  await expect(page.locator("audio")).toHaveCount(0);

  // No job, no event: the job's timeline has no "Drilled" line.
  await page.waitForTimeout(500);
  await page.goto(`/jobs/${slug}?tab=timeline`);
  await expect(page.getByText(/^Drilled \d+ questions?/)).toHaveCount(0);
});

test("the same question in two jobs shows two marks with dates on its item page", async ({ page }, testInfo) => {
  test.slow();
  const s = await setup(page, testInfo);
  const token = uniqueName(testInfo, "Fenwick");
  const dir = await writeBank(testInfo, token);
  const a = await addJobWithBank(page, testInfo, s, dir, "Northwind Traders");
  const b = await addJobWithBank(page, testInfo, s, dir, "Contoso Foods");
  const question = questionOf(token, 1);

  await markOnHub(page, a.slug, question, "Solid");
  await markOnHub(page, b.slug, question, "Shaky");
  await saveFromHub(page, a.slug, question);

  await expect(page.getByText("Used in 2 jobs")).toBeVisible();
  const history = page.getByRole("region", { name: "Marks by job" });
  const lineA = history.getByRole("listitem").filter({ hasText: a.company });
  const lineB = history.getByRole("listitem").filter({ hasText: b.company });
  await expect(lineA).toContainText("Solid");
  await expect(lineB).toContainText("Shaky");
  // Each mark carries the date it was made.
  await expect(lineA.locator("time")).toHaveCount(1);
  await expect(lineB.locator("time")).toHaveCount(1);
  await expect(lineA.locator("time")).toHaveAttribute("datetime", /^\d{4}-\d{2}-\d{2}T/);
});

test("the Library list, an item page, Quick-fire and Drill pass axe in light and dark on every project", async ({ page }, testInfo) => {
  test.slow();
  const s = await setup(page, testInfo);
  await stubSpeech(page);
  const phone = testInfo.project.name.endsWith("phone");
  const token = uniqueName(testInfo, "Garnet");
  const { slug, company } = await addJobWithBank(page, testInfo, s, await writeBank(testInfo, token));
  const question = questionOf(token, 1);

  const itemUrl = await saveFromHub(page, slug, question);
  await markOnHub(page, slug, question, "Okay");
  await page.goto(itemUrl);
  await expect(page.getByRole("link", { name: new RegExp(`^${company}, Design Lead$`) }).first()).toBeVisible();
  await scanForViolations(page, "library item", testInfo);
  if (phone) await expectNoSideways(page, "library item");

  await page.goto(`/library?q=${encodeURIComponent(token)}`);
  await expect(page.getByRole("link", { name: question })).toBeVisible();
  await scanForViolations(page, "library list", testInfo);
  if (phone) await expectNoSideways(page, "library list");

  // Quick-fire holds its state in the page, so it is scanned where it stands.
  await page.goto("/library/quick-fire");
  await expect(page.getByTestId("quick-fire-count")).toBeVisible();
  await scanInPlace(page, "library quick-fire count", testInfo);
  await expect(page.getByText("Spine", { exact: true })).toBeVisible({ timeout: 15_000 });
  await scanInPlace(page, "library quick-fire reveal", testInfo);
  if (phone) await expectNoSideways(page, "library quick-fire");

  await page.goto("/library/drill?n=2");
  await expect(page.getByRole("button", { name: "Start drill" })).toBeVisible();
  await scanInPlace(page, "library drill start", testInfo);
  if (phone) await expectNoSideways(page, "library drill start");
  await page.getByRole("button", { name: "Start drill" }).click();
  await expect(page.getByRole("timer")).toBeVisible();
  await scanInPlace(page, "library drill gap", testInfo);
  await page.getByRole("button", { name: "Done" }).click();
  await expect(page.getByText("Spine", { exact: true }).or(page.getByRole("group", { name: "Mark this answer" })).first()).toBeVisible();
  await scanInPlace(page, "library drill reveal", testInfo);
  if (phone) await expectNoSideways(page, "library drill reveal");
  await page.getByRole("button", { name: "Solid", exact: true }).click();
  await expect(page.getByText(/Question 2 of 2|This drill/).first()).toBeVisible();
});
