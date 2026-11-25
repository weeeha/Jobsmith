import { test, expect, type BrowserContext, type Page, type TestInfo } from "./settled";
import { scanForViolations } from "./axe";
import { runCli } from "./cli";
import { addJobAndOpen, login, uniqueName } from "./session";
import { plays, spoken, stubSpeech } from "./stub-speech";
import { createToken } from "./token";

// Milestone 10, Phone. The specs prove the done-when sentence with
// context.setOffline in place of airplane mode: a saved job's bank plays with
// no network, and a mark made offline shows on the hub after reconnecting.
// The worker registers only in a production build, which is what the suite
// starts. Playwright's setOffline also blocks the worker's own network calls,
// so every offline read below is answered from Cache Storage. The fixture is
// the prep fixture (seven questions, five with an answer). Every value here is
// fictional.
test.describe.configure({ mode: "serial" });

const BANK_KEY = "answers-full";
const DOC = `doc=job%3A${BANK_KEY}`;
const FRESH = "0 solid · 0 okay · 0 shaky · 7 unmarked";

async function requireServiceWorker(page: Page) {
  const supported = await page.evaluate(() => "serviceWorker" in navigator && "caches" in window);
  test.skip(!supported, "navigator.serviceWorker or Cache Storage is missing in this engine");
}

/** A job with the prep fixture pushed and its audio prepared. */
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

  await page.goto(`/jobs/${slug}?tab=prep`);
  const bank = page.locator(`[data-bank-key="${BANK_KEY}"]`);
  const prepare = bank.getByRole("button", { name: "Prepare audio" });
  if (await prepare.isVisible()) await prepare.click();
  await expect(bank.getByText("Audio ready", { exact: true })).toBeVisible({ timeout: 90_000 });
  return { slug };
}

/** The worker is registered, active and in control of this page. */
async function waitForWorker(page: Page) {
  await page.waitForFunction(() => !!navigator.serviceWorker?.controller, undefined, { timeout: 30_000 });
}

const offlineRegion = (page: Page) => page.getByRole("region", { name: "Offline" });

/** Opens the hub, presses Save for offline and waits for Saved. */
async function saveJob(page: Page, slug: string) {
  await page.goto(`/jobs/${slug}?tab=prep`);
  await waitForWorker(page);
  const region = offlineRegion(page);
  await region.getByRole("button", { name: "Save for offline" }).click();
  await expect(region.getByText("Saved", { exact: true })).toBeVisible({ timeout: 120_000 });
}

const listenUrl = (slug: string) => `/jobs/${slug}/listen?${DOC}`;
const waiting = (page: Page, count: number) => page.getByText(`${count} ${count === 1 ? "mark" : "marks"} waiting to sync`);

async function goOffline(context: BrowserContext) {
  await context.setOffline(true);
}

// Playwright's WebKit fails every page load made under context.setOffline with
// "WebKit encountered an internal error", whether page.goto or the page itself
// starts it, even when the worker answers from Cache Storage. Specs that load a
// page while offline run on Chromium only; Safari needs a hand check.
function skipOfflineLoadsOnWebKit(browserName: string) {
  test.skip(browserName === "webkit", "Playwright WebKit cannot load a page while context.setOffline is on");
}

test("the manifest and icons load without a session and the app registers a service worker", async ({ page, playwright, baseURL }, testInfo) => {
  test.slow();
  // A request with no cookies at all: each answers 200 itself, no redirect to login.
  const bare = await playwright.request.newContext({ baseURL });
  try {
    const manifest = await bare.get("/manifest.webmanifest", { maxRedirects: 0 });
    expect(manifest.status()).toBe(200);
    const body = await manifest.json();
    expect(body.name).toBe("Jobsmith");
    expect(body.display).toBe("standalone");
    for (const path of ["/icons/icon-192.png", "/icons/icon-512.png"]) {
      const icon = await bare.get(path, { maxRedirects: 0 });
      expect(icon.status(), path).toBe(200);
      expect(icon.headers()["content-type"]).toBe("image/png");
    }
    const sw = await bare.get("/sw.js", { maxRedirects: 0 });
    expect(sw.status()).toBe(200);
    expect(sw.headers()["content-type"]).toMatch(/javascript/);
    expect(sw.headers()["cache-control"]).toMatch(/no-cache|max-age=0/);
    const offlinePage = await bare.get("/offline", { maxRedirects: 0 });
    expect(offlinePage.status()).toBe(200);
    expect(await offlinePage.text()).toContain("You are offline.");
  } finally {
    await bare.dispose();
  }

  await login(page);
  await requireServiceWorker(page);
  await waitForWorker(page);
  const scope = await page.evaluate(async () => {
    const reg = await navigator.serviceWorker.getRegistration();
    return { scope: reg?.scope, active: reg?.active?.state };
  });
  expect(scope.scope).toBe(`${new URL(page.url()).origin}/`);
  expect(scope.active).toBe("activated");
  void testInfo;
});

test("Save for offline shows the size, saves, and shows Saved with the date", async ({ page }, testInfo) => {
  test.slow();
  const { slug } = await setup(page, testInfo);
  await page.goto(`/jobs/${slug}?tab=prep`);
  await requireServiceWorker(page);
  await waitForWorker(page);
  const region = offlineRegion(page);
  await expect(region.getByText(/^\d+ MB, \d+ clips?$/)).toBeVisible();
  await expect(region.getByRole("button", { name: "Save for offline" })).toBeVisible();
  // Nothing is saved until the press.
  expect(await page.evaluate(async () => (await caches.keys()).filter((n) => n.startsWith("jobsmith-prep-")))).toEqual([]);
  await scanForViolations(page, "hub with the offline panel", testInfo);
  await waitForWorker(page);

  await region.getByRole("button", { name: "Save for offline" }).click();
  await expect(region.getByText("Saved", { exact: true })).toBeVisible({ timeout: 120_000 });
  await expect(region.locator("time")).toBeVisible();
  await expect(region.getByRole("button", { name: "Remove saved copy" })).toBeVisible();
  const saved = await page.evaluate(async () => (await caches.keys()).filter((n) => n.startsWith("jobsmith-prep-")));
  expect(saved.length).toBe(1);

  // It stays saved across a reload, and the saved hub passes axe.
  await scanForViolations(page, "hub with a saved job", testInfo);
  await expect(offlineRegion(page).getByText("Saved", { exact: true })).toBeVisible();

  await region.getByRole("button", { name: "Remove saved copy" }).click();
  await expect(offlineRegion(page).getByRole("button", { name: "Save for offline" })).toBeVisible();
  expect(await page.evaluate(async () => (await caches.keys()).filter((n) => n.startsWith("jobsmith-prep-")))).toEqual([]);
});

test("offline, a saved bank plays: Listen advances and the clips come from the cache", async ({ page, context, browserName }, testInfo) => {
  skipOfflineLoadsOnWebKit(browserName);
  test.slow();
  await stubSpeech(page);
  const { slug } = await setup(page, testInfo);
  await requireServiceWorker(page);
  await saveJob(page, slug);

  await goOffline(context);
  const networkClips: string[] = [];
  context.on("requestfinished", (r) => {
    if (r.url().includes("/api/assets/")) networkClips.push(r.url());
  });
  await page.goto(listenUrl(slug));
  const header = page.getByText(/^Question \d+ of \d+$/);
  await expect(header).toHaveText(/^Question 1 of \d+$/);
  await expect(page.getByRole("region", { name: "Transcript" })).toBeVisible();

  await page.getByRole("button", { name: "Play", exact: true }).click();
  const playing = page.locator('[aria-current="true"]');
  await expect(playing).toHaveCount(1, { timeout: 20_000 });
  const first = await playing.innerText();
  await expect(async () => {
    await expect(playing).toHaveCount(1);
    expect(await playing.innerText()).not.toBe(first);
  }).toPass({ timeout: 60_000 });

  // The clips played, none fell back to the browser voice, and the audio
  // element's source is the asset route that only the cache could answer.
  await expect(async () => {
    const all = await plays(page);
    expect(all.length).toBeGreaterThanOrEqual(2);
    for (const p of all) expect(p.src).toMatch(/\/api\/assets\/[0-9a-f-]{36}$/);
  }).toPass({ timeout: 30_000 });
  expect(await spoken(page)).toEqual([]);

  const numberOf = async () => Number((await header.innerText()).match(/Question (\d+) of/)![1]);
  const before = await numberOf();
  await page.getByRole("button", { name: "Next question" }).click();
  await expect(async () => {
    expect(await numberOf()).toBeGreaterThan(before);
  }).toPass({ timeout: 10_000 });
  void networkClips;
});

test("a mark made offline shows '1 mark waiting to sync' and appears on the hub after reconnecting", async ({ page, context, browserName }, testInfo) => {
  skipOfflineLoadsOnWebKit(browserName);
  test.slow();
  const { slug } = await setup(page, testInfo);
  await requireServiceWorker(page);
  await saveJob(page, slug);

  await goOffline(context);
  await page.goto(listenUrl(slug));
  await expect(page.getByText(/^Question 1 of \d+$/)).toBeVisible();
  await page.getByRole("button", { name: "Solid" }).click();
  await expect(page.getByRole("button", { name: "Solid" })).toHaveAttribute("aria-pressed", "true");
  await expect(waiting(page, 1)).toBeVisible();

  await context.setOffline(false);
  await expect(waiting(page, 1)).toHaveCount(0, { timeout: 30_000 });
  await page.goto(`/jobs/${slug}?tab=prep`);
  await expect(page.getByText("1 solid · 0 okay · 0 shaky · 6 unmarked")).toBeVisible();
  const first = page.getByRole("listitem").filter({ hasText: "Tell me about yourself" });
  await expect(first.locator('[data-level="solid"]')).toBeVisible();
});

test("a newer mark made online is not overridden by an older offline mark", async ({ page, context, browser, baseURL, browserName }, testInfo) => {
  skipOfflineLoadsOnWebKit(browserName);
  test.slow();
  const { slug } = await setup(page, testInfo);
  await requireServiceWorker(page);
  await saveJob(page, slug);

  await goOffline(context);
  await page.goto(listenUrl(slug));
  await expect(page.getByText(/^Question 1 of \d+$/)).toBeVisible();
  await page.getByRole("button", { name: "Solid" }).click();
  await expect(waiting(page, 1)).toBeVisible();

  // Later, on another device: the same question marked Shaky.
  const other = await browser.newContext({ baseURL });
  try {
    const desk = await other.newPage();
    await login(desk);
    await desk.goto(listenUrl(slug));
    await expect(desk.getByText(/^Question 1 of \d+$/)).toBeVisible();
    await desk.getByRole("button", { name: "Shaky" }).click();
    await expect(desk.getByRole("button", { name: "Shaky" })).toHaveAttribute("aria-pressed", "true");
    await desk.goto(`/jobs/${slug}?tab=prep`);
    await expect(desk.getByText("0 solid · 0 okay · 1 shaky · 6 unmarked")).toBeVisible();
  } finally {
    await other.close();
  }

  await context.setOffline(false);
  await expect(waiting(page, 1)).toHaveCount(0, { timeout: 30_000 });
  await page.goto(`/jobs/${slug}?tab=prep`);
  // The older offline Solid was refused: the newer Shaky stands.
  await expect(page.getByText("0 solid · 0 okay · 1 shaky · 6 unmarked")).toBeVisible();
});

test("an unsaved page offline shows the offline notice with 'Open a saved job'", async ({ page, context, browserName }, testInfo) => {
  skipOfflineLoadsOnWebKit(browserName);
  test.slow();
  const { slug } = await setup(page, testInfo);
  await requireServiceWorker(page);

  // Nothing saved yet: the notice says so.
  await waitForWorker(page);
  await goOffline(context);
  await page.goto("/board");
  await expect(page.getByRole("heading", { name: "You are offline." })).toBeVisible();
  await expect(page.getByText("Nothing is saved on this device yet.")).toBeVisible();
  await context.setOffline(false);

  await saveJob(page, slug);
  await goOffline(context);
  await page.goto("/board");
  await expect(page.getByRole("heading", { name: "You are offline." })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Open a saved job" })).toBeVisible();
  const job = page.getByRole("group", { name: /^Design Lead at / });
  await expect(job).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);

  // The link opens the saved Listen page with no network.
  await job.getByRole("link", { name: /^Listen: / }).first().click();
  await expect(page).toHaveURL(/\/listen\?doc=job/);
  await expect(page.getByText(/^Question 1 of \d+$/)).toBeVisible();
});

test("Drill and Quick-fire run offline from the saved pages and their marks queue", async ({ page, context, browserName }, testInfo) => {
  skipOfflineLoadsOnWebKit(browserName);
  test.slow();
  await stubSpeech(page);
  const { slug } = await setup(page, testInfo);
  await requireServiceWorker(page);
  await saveJob(page, slug);

  await goOffline(context);
  await page.goto(`/jobs/${slug}/quick-fire?${DOC}`);
  await expect(page.getByText(/^Question 1 of \d+$/)).toBeVisible();
  await expect(page.getByText("Spine", { exact: true })).toBeVisible({ timeout: 15_000 });
  await page.getByRole("button", { name: "Solid" }).click();
  await expect(waiting(page, 1)).toBeVisible();

  await page.goto(`/jobs/${slug}/drill?${DOC}`);
  await page.getByRole("button", { name: "Start drill" }).click();
  await page.getByRole("button", { name: "Done" }).click();
  await page.getByRole("button", { name: "Okay", exact: true }).click();
  await expect(waiting(page, 2)).toBeVisible();

  await context.setOffline(false);
  await expect(page.getByText(/marks? waiting to sync/)).toHaveCount(0, { timeout: 30_000 });
  await page.goto(`/jobs/${slug}?tab=prep`);
  await expect(page.getByText(/^\d+ solid · \d+ okay · \d+ shaky · \d+ unmarked$/)).not.toHaveText(FRESH);
});

test("sign-out deletes every jobsmith-prep cache and the queued marks", async ({ page, context, isMobile, browserName }, testInfo) => {
  test.slow();
  test.skip(isMobile, "The account menu sits in the sidebar, which the phone shell hides behind its sheet.");
  // In Playwright's WebKit the routed abort below does not stop the mark once
  // the worker controls the page: the mark is sent and nothing queues.
  test.skip(browserName === "webkit", "Playwright WebKit does not abort the mark request on a worker-controlled page");
  const { slug } = await setup(page, testInfo);
  await requireServiceWorker(page);
  await saveJob(page, slug);

  // Keep one mark queued while online: the server's mark calls fail.
  await page.route("**/*", (route) => {
    const request = route.request();
    if (request.method() === "POST" && (request.postData() ?? "").includes("questionKey")) return route.abort();
    return route.continue();
  });
  await page.goto(listenUrl(slug));
  await expect(page.getByText(/^Question 1 of \d+$/)).toBeVisible();
  await page.getByRole("button", { name: "Solid" }).click();
  await expect(waiting(page, 1)).toBeVisible();
  const before = await page.evaluate(async () => ({
    caches: (await caches.keys()).filter((n) => n.startsWith("jobsmith-prep-")),
    marks: await new Promise<number>((resolve) => {
      const open = indexedDB.open("jobsmith-offline");
      open.onsuccess = () => {
        const req = open.result.transaction("marks").objectStore("marks").count();
        req.onsuccess = () => resolve(req.result);
      };
    }),
  }));
  expect(before.caches.length).toBe(1);
  expect(before.marks).toBe(1);

  await page.getByRole("button", { name: /Account menu/i }).click();
  await page.getByRole("menuitem", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/login$/);

  const after = await page.evaluate(async () => ({
    caches: (await caches.keys()).filter((n) => n.startsWith("jobsmith-prep-")),
    marks: await new Promise<number>((resolve) => {
      const open = indexedDB.open("jobsmith-offline");
      open.onsuccess = () => {
        const req = open.result.transaction("marks").objectStore("marks").count();
        req.onsuccess = () => resolve(req.result);
      };
    }),
  }));
  expect(after).toEqual({ caches: [], marks: 0 });
  void context;
});

test("the offline page passes axe in light and dark", async ({ page, context, browserName }, testInfo) => {
  skipOfflineLoadsOnWebKit(browserName);
  test.slow();
  const { slug } = await setup(page, testInfo);
  await requireServiceWorker(page);
  await saveJob(page, slug);

  // With a saved job listed, then the same page with no network at all.
  await page.goto("/offline");
  await expect(page.getByRole("heading", { name: "Open a saved job" })).toBeVisible();
  await scanForViolations(page, "offline page", testInfo);
  await goOffline(context);
  await page.goto("/offline");
  await expect(page.getByRole("heading", { name: "Open a saved job" })).toBeVisible();
  await scanForViolations(page, "offline page with no network", testInfo);
});

test("the install hint shows in the browser and not in standalone", async ({ page, browser, baseURL }, testInfo) => {
  test.slow();
  const { slug } = await setup(page, testInfo);
  await page.goto(`/jobs/${slug}?tab=prep`);
  const hint = page.getByText("Install on your phone", { exact: true });
  await expect(hint).toBeVisible();
  await hint.click();
  await expect(page.getByText(/share sheet or the browser menu/)).toBeVisible();
  await expect(page.getByText(/seven days/)).toBeVisible();
  await expect(page.getByText(/locked screen/)).toBeVisible();

  // Dismissed once, it stays dismissed on this device.
  await page.getByRole("button", { name: "Dismiss" }).click();
  await expect(hint).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole("region", { name: "Offline" })).toBeVisible();
  await expect(hint).toHaveCount(0);

  // Inside an installed app (display-mode: standalone) it never shows.
  const installed = await browser.newContext({ baseURL });
  try {
    await installed.addInitScript(() => {
      const real = window.matchMedia.bind(window);
      window.matchMedia = (query: string) => {
        const result = real(query);
        if (!query.includes("display-mode: standalone")) return result;
        return { ...result, matches: true, media: query, addEventListener() {}, removeEventListener() {} } as unknown as MediaQueryList;
      };
    });
    const app = await installed.newPage();
    await login(app);
    await app.goto(`/jobs/${slug}?tab=prep`);
    await expect(app.getByRole("region", { name: "Offline" })).toBeVisible();
    await expect(app.getByText("Install on your phone", { exact: true })).toHaveCount(0);
  } finally {
    await installed.close();
  }
});
