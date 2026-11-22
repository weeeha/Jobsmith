import { test, expect, type Page, type TestInfo } from "@playwright/test";
import { scanForViolations } from "./axe";
import { runCli } from "./cli";
import { startFakeSpeechServer } from "./fake-speech-server";
import { addJobAndOpen, login, uniqueName } from "./session";
import { plays, spoken, stubSpeech } from "./stub-speech";
import { createToken } from "./token";

// The voice specs run on the shared account, after the fit specs and one
// engine at a time (playwright.config.ts). The server runs with
// TTS_PROVIDER=fake (deterministic silent MP3 clips) and STORAGE_PROVIDER=local.
// Headless browsers cannot be heard, so the specs assert what is observable:
// the clips stored, the asset route's headers, the player's state and
// transcript, and what the stubbed speechSynthesis was asked to say.
// WebKit may not decode MP3 on every image: the engine falls back to the
// browser voice when a clip errors, so the specs only rely on the transcript
// advancing, never on a clip finishing. Every value here is fictional.
test.describe.configure({ mode: "serial" });
// The app's service worker would answer /api/assets itself, outside what
// page.route can abort, so the failed-clip spec could not fail a clip. These
// specs have nothing to do with offline: keep the worker out of them.
test.use({ serviceWorkers: "block" });

const BANK_KEY = "answers-full";
const BANK = `[data-bank-key="${BANK_KEY}"]`;
const LISTEN = `listen?doc=job%3A${BANK_KEY}`;

async function newJob(page: Page, testInfo: TestInfo, company = "Northwind Traders") {
  await login(page);
  const slug = await addJobAndOpen(page, uniqueName(testInfo, company), "Design Lead");
  const origin = new URL(page.url()).origin;
  return { slug, origin };
}

async function pushWith(page: Page, testInfo: TestInfo, dir: string, prefix: string, origin: string, slug: string) {
  const token = await createToken(page, uniqueName(testInfo, "CLI"), testInfo);
  const configHome = testInfo.outputPath("cli-config");
  const loggedIn = await runCli(["login", "--url", origin], { configHome, input: `${token}\n` });
  expect(loggedIn.code).toBe(0);
  const pushed = await runCli(["push", slug, "--dir", dir, "--prefix", prefix], { configHome });
  expect(pushed.code, pushed.stderr).toBe(0);
  return configHome;
}

/** A job with the prep fixture pushed. Returns what the specs need. */
async function setup(page: Page, testInfo: TestInfo) {
  const { slug, origin } = await newJob(page, testInfo);
  const configHome = await pushWith(page, testInfo, "tests/fixtures/prep", "nwt", origin, slug);
  return { slug, origin, configHome };
}

/** Clips are shared by hash across a user's jobs, so a spec that needs a job with none empties the store first. */
async function clearAudio(page: Page) {
  await page.goto("/settings");
  const button = page.getByRole("button", { name: "Delete all audio" });
  await expect(button).toBeVisible();
  if (await button.isEnabled()) {
    await button.click();
    const dialog = page.getByRole("dialog", { name: "Delete all audio?" });
    await dialog.getByRole("button", { name: "Delete all clips" }).click();
    await expect(dialog).toBeHidden();
  }
  await expect(page.getByText("0 clips, 0 B")).toBeVisible();
}

async function prepareAudio(page: Page, slug: string) {
  await page.goto(`/jobs/${slug}?tab=prep`);
  const bank = page.locator(BANK);
  await expect(bank.getByText(/^Audio: 0 of \d+ clips$/)).toBeVisible();
  await bank.getByRole("button", { name: "Prepare audio" }).click();
  await expect(bank.getByText("Audio ready", { exact: true })).toBeVisible({ timeout: 60_000 });
}

function openListen(page: Page, slug: string) {
  return page.goto(`/jobs/${slug}/${LISTEN}`);
}

test("Prepare audio climbs from none to ready on the hub", async ({ page }, testInfo) => {
  test.slow();
  const { slug } = await setup(page, testInfo);
  await clearAudio(page);

  await page.goto(`/jobs/${slug}?tab=prep`);
  const bank = page.locator(BANK);
  await expect(bank.getByText(/^Audio: 0 of \d+ clips$/)).toBeVisible();
  const total = Number((await bank.getByText(/^Audio: 0 of \d+ clips$/).innerText()).match(/of (\d+)/)![1]);
  expect(total).toBeGreaterThan(0);

  await bank.getByRole("button", { name: "Prepare audio" }).click();
  await expect(bank.getByText("Audio ready", { exact: true })).toBeVisible({ timeout: 60_000 });
  await expect(bank.getByRole("button", { name: "Prepare audio" })).toHaveCount(0);
  await expect(bank.getByRole("button", { name: "Delete audio" })).toBeVisible();

  // The clips are stored: a reload still says ready, and Settings counts them.
  await page.reload();
  await expect(page.locator(BANK).getByText("Audio ready", { exact: true })).toBeVisible();
  await page.goto("/settings");
  await expect(page.getByText(new RegExp(`^${total} clips?, `))).toBeVisible();
});

test("Listen plays two questions in two voices and highlights the playing block", async ({ page }, testInfo) => {
  test.slow();
  const { slug } = await setup(page, testInfo);
  await clearAudio(page);
  await prepareAudio(page, slug);

  await stubSpeech(page);
  await openListen(page, slug);
  const header = page.getByText(/^Question \d+ of \d+$/);
  await expect(header).toHaveText(/^Question 1 of \d+$/);
  const total = Number((await header.innerText()).match(/of (\d+)/)![1]);
  await expect(page.getByRole("region", { name: "Transcript" })).toBeVisible();

  await page.getByRole("button", { name: "Play", exact: true }).click();
  const playing = page.locator('[aria-current="true"]');
  await expect(playing).toHaveCount(1, { timeout: 20_000 });
  const first = await playing.innerText();

  // The highlight moves on its own from the question line to the answer.
  await expect(async () => {
    await expect(playing).toHaveCount(1);
    expect(await playing.innerText()).not.toBe(first);
  }).toPass({ timeout: 60_000 });

  // Two voices: the interviewer's question and the candidate's answer are two
  // different clips, both served by the asset route.
  await expect(async () => {
    const urls = new Set((await plays(page)).map((p) => p.src));
    expect(urls.size).toBeGreaterThanOrEqual(2);
    for (const url of urls) expect(url).toMatch(/\/api\/assets\/[0-9a-f-]{36}$/);
  }).toPass({ timeout: 30_000 });

  // Next question: the header advances (playback may already have moved on by
  // itself, since the clips are short) and a block of the new question plays.
  const numberOf = async () => Number((await header.innerText()).match(/Question (\d+) of/)![1]);
  const before = await numberOf();
  await page.getByRole("button", { name: "Next question" }).click();
  await expect(async () => {
    expect(await numberOf()).toBeGreaterThan(before);
  }).toPass({ timeout: 10_000 });
  await expect(header).toHaveText(new RegExp(`^Question \\d+ of ${total}$`));
  await expect(playing).toHaveCount(1, { timeout: 20_000 });

  // Speed 1.5 goes through playbackRate of the next clip.
  await page.getByLabel("Speed").selectOption("1.5");
  await page.getByRole("button", { name: "Repeat question" }).click();
  await expect(async () => {
    const all = await plays(page);
    expect(all.at(-1)?.rate).toBe(1.5);
  }).toPass({ timeout: 20_000 });
  expect((await plays(page))[0].rate).toBe(1);
  // Nothing fell back to the browser voice: every step had a clip.
  expect(await spoken(page)).toEqual([]);
});

test("a mark taps through while playing and playback continues", async ({ page }, testInfo) => {
  test.slow();
  const { slug } = await setup(page, testInfo);
  await clearAudio(page);
  await prepareAudio(page, slug);

  await stubSpeech(page);
  await openListen(page, slug);
  await page.getByRole("button", { name: "Play", exact: true }).click();
  await expect(page.locator('[aria-current="true"]')).toHaveCount(1, { timeout: 20_000 });

  await page.getByRole("button", { name: "Solid" }).click();
  await expect(page.getByRole("button", { name: "Solid" })).toHaveAttribute("aria-pressed", "true");
  // Still playing: the control says Pause and a block is still highlighted.
  await expect(page.getByRole("button", { name: "Pause", exact: true })).toBeVisible();
  await expect(page.locator('[aria-current="true"]')).toHaveCount(1);

  // The mark reached the hub.
  await page.goto(`/jobs/${slug}?tab=prep`);
  await expect(page.getByText("1 solid · 0 okay · 0 shaky · 6 unmarked")).toBeVisible();
});

test("a failed clip speaks through the browser voice and a missing clip is labelled", async ({ page }, testInfo) => {
  test.slow();
  const { slug } = await setup(page, testInfo);
  await clearAudio(page);

  // No clips yet: the transcript labels the steps the browser will read.
  await stubSpeech(page);
  await openListen(page, slug);
  await expect(page.getByText("Browser voice").first()).toBeVisible();
  await page.getByRole("button", { name: "Play", exact: true }).click();
  await expect(async () => {
    expect((await spoken(page)).length).toBeGreaterThanOrEqual(2);
  }).toPass({ timeout: 30_000 });
  expect((await plays(page)).length).toBe(0);

  // Clips exist but the browser cannot fetch them: the same fallback, and the
  // transcript still advances.
  await prepareAudio(page, slug);
  await page.route("**/api/assets/**", (route) => route.abort());
  await stubSpeech(page);
  await openListen(page, slug);
  await expect(page.getByText("Browser voice")).toHaveCount(0);
  await page.getByRole("button", { name: "Play", exact: true }).click();
  await expect(async () => {
    expect((await spoken(page)).length).toBeGreaterThanOrEqual(2);
  }).toPass({ timeout: 30_000 });
  await expect(page.locator('[aria-current="true"]')).toHaveCount(1);
});

test("the asset route answers a Range request with 206, refuses a stranger and a signed-out caller", async ({ page, playwright, baseURL }, testInfo) => {
  test.slow();
  const { slug } = await setup(page, testInfo);
  await clearAudio(page);
  await prepareAudio(page, slug);

  await stubSpeech(page);
  await openListen(page, slug);
  await page.getByRole("button", { name: "Play", exact: true }).click();
  await expect(async () => {
    expect((await plays(page)).length).toBeGreaterThanOrEqual(1);
  }).toPass({ timeout: 20_000 });
  const url = (await plays(page))[0].src;
  expect(url).toMatch(/^\/api\/assets\/[0-9a-f-]{36}$/);

  const whole = await page.request.get(url);
  expect(whole.status()).toBe(200);
  expect(whole.headers()["content-type"]).toBe("audio/mpeg");
  expect(whole.headers()["accept-ranges"]).toBe("bytes");
  expect(whole.headers()["cache-control"]).toContain("private");
  const size = Number(whole.headers()["content-length"]);
  expect(size).toBeGreaterThan(1000);
  expect((await whole.body()).length).toBe(size);

  const part = await page.request.get(url, { headers: { Range: "bytes=0-99" } });
  expect(part.status()).toBe(206);
  expect(part.headers()["content-range"]).toBe(`bytes 0-99/${size}`);
  expect(part.headers()["content-length"]).toBe("100");
  expect((await part.body()).length).toBe(100);

  const beyond = await page.request.get(url, { headers: { Range: `bytes=${size + 10}-${size + 20}` } });
  expect(beyond.status()).toBe(416);

  // The account is the only one, so a foreign id is one no asset of this user has.
  const foreign = await page.request.get("/api/assets/00000000-0000-4000-8000-000000000000");
  expect(foreign.status()).toBe(404);
  expect((await page.request.get("/api/assets/not-an-id")).status()).toBe(404);

  // Signed out: nothing is served, whatever the id.
  const anonymous = await playwright.request.newContext({ baseURL, maxRedirects: 0 });
  try {
    const refused = await anonymous.get(url);
    expect(refused.status()).not.toBe(200);
    expect(refused.status()).not.toBe(206);
    expect([301, 302, 303, 307, 308, 401, 403]).toContain(refused.status());
    expect(refused.headers()["content-type"] ?? "").not.toContain("audio");
  } finally {
    await anonymous.dispose();
  }
});

test("a pitch opens in Listen as chapters", async ({ page }, testInfo) => {
  test.slow();
  const { slug, origin } = await newJob(page, testInfo);
  await pushWith(page, testInfo, "tests/fixtures/packet", "nwl", origin, slug);

  await page.goto(`/jobs/${slug}?tab=prep`);
  const link = page.getByRole("link", { name: /^Listen: / });
  await expect(link).toHaveCount(1);
  await link.click();
  await expect(page).toHaveURL(/\/listen\?doc=/);

  await stubSpeech(page);
  await page.reload();
  await expect(page.getByText(/^Chapter 1 of \d+$/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Next chapter" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Solid" })).toHaveCount(0);
  await page.getByRole("button", { name: "Play", exact: true }).click();
  await expect(page.getByRole("button", { name: "Pause", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Next chapter" }).click();
  await expect(page.getByText(/^Chapter 2 of \d+$/)).toBeVisible();
});

test("changing a voice in Settings starts a new plan and keeps the old clips", async ({ page }, testInfo) => {
  test.slow();
  const { slug } = await setup(page, testInfo);
  await clearAudio(page);
  await prepareAudio(page, slug);

  await page.goto("/settings");
  const storage = page.getByText(/^\d+ clips?, /);
  await expect(storage).toBeVisible();
  const before = await storage.innerText();
  const interviewer = page.getByLabel("Interviewer voice", { exact: true });
  await expect(interviewer.locator("option")).toHaveText(["Vivian", "Ryan", "Aria"]);
  const original = await interviewer.inputValue();
  const other = original === "Aria" ? "Ryan" : "Aria";

  await interviewer.selectOption(other);
  await page.getByRole("button", { name: "Save voice settings" }).click();
  await expect(page.getByText("Voice settings saved.").first()).toBeVisible();

  // The interviewer's lines have no clip under the new voice: partial, and the
  // old clips are still stored.
  await page.goto(`/jobs/${slug}?tab=prep`);
  const bank = page.locator(BANK);
  const line = bank.getByText(/^Audio: \d+ of \d+ clips$/);
  await expect(line).toBeVisible();
  const [done, total] = (await line.innerText()).match(/\d+/g)!.map(Number);
  expect(done).toBeLessThan(total);
  expect(done).toBeGreaterThan(0);
  await page.goto("/settings");
  await expect(page.getByText(before, { exact: true })).toBeVisible();

  // Back to the first voice: the kept clips make the bank ready again at once.
  await page.getByLabel("Interviewer voice", { exact: true }).selectOption(original);
  await page.getByRole("button", { name: "Save voice settings" }).click();
  await expect(page.getByText("Voice settings saved.").first()).toBeVisible();
  await page.goto(`/jobs/${slug}?tab=prep`);
  await expect(page.locator(BANK).getByText("Audio ready", { exact: true })).toBeVisible();
});

test("jobsmith audio uploads clips from a speech server on 127.0.0.1 and the hub shows Audio ready", async ({ page }, testInfo) => {
  test.slow();
  const { slug, configHome } = await setup(page, testInfo);
  await clearAudio(page);

  await page.goto(`/jobs/${slug}?tab=prep`);
  await expect(page.locator(BANK).getByText(/^Audio: 0 of \d+ clips$/)).toBeVisible();

  const speech = await startFakeSpeechServer();
  process.env.JOBSMITH_TTS_API_KEY = "test-key-not-real";
  try {
    const result = await runCli(["audio", slug, "--tts-url", speech.baseUrl], { configHome });
    expect(result.code, result.stderr).toBe(0);
    expect(result.stdout).toMatch(/Uploaded [1-9]\d* clips/);

    // Text went to the named endpoint only, with the key, as two voices.
    expect(speech.calls.length).toBeGreaterThan(0);
    expect(speech.calls.every((call) => call.authorization === "Bearer test-key-not-real")).toBe(true);
    expect(new Set(speech.calls.map((call) => call.voice)).size).toBe(2);
    expect(speech.calls.every((call) => call.input.length > 0)).toBe(true);

    // A second run finds nothing left to make.
    const again = await runCli(["audio", slug, "--tts-url", speech.baseUrl], { configHome });
    expect(again.code, again.stderr).toBe(0);
    expect(again.stdout).toContain("Synthesized 0 of 0 clips.");
  } finally {
    Reflect.deleteProperty(process.env, "JOBSMITH_TTS_API_KEY");
    await speech.close();
  }

  await page.reload();
  await expect(page.locator(BANK).getByText("Audio ready", { exact: true })).toBeVisible();
});

test("Listen, the hub's audio panel and the Settings Voice section pass axe in light and dark", async ({ page }, testInfo) => {
  test.slow();
  const { slug } = await setup(page, testInfo);
  await clearAudio(page);

  await page.goto(`/jobs/${slug}?tab=prep`);
  await expect(page.locator(BANK).getByText(/^Audio: 0 of \d+ clips$/)).toBeVisible();
  await scanForViolations(page, "prep hub with audio panel, not prepared", testInfo);
  await prepareAudio(page, slug);
  await scanForViolations(page, "prep hub with audio panel, ready", testInfo);

  await openListen(page, slug);
  await expect(page.getByText(/^Question 1 of \d+$/)).toBeVisible();
  await scanForViolations(page, "listen", testInfo);

  await page.goto("/settings");
  await expect(page.getByRole("heading", { name: "Voice", exact: true })).toBeVisible();
  await expect(page.getByLabel("Interviewer voice", { exact: true }).locator("option")).toHaveCount(3);
  await scanForViolations(page, "settings voice", testInfo);
});
