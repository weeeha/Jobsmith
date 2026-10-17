import { test, expect } from "@playwright/test";
import { scanOpenOverlay } from "./scan-open";
import { login } from "./session";

test("the time zone field suggests zones as you type and refuses one it does not know", async ({ page }, testInfo) => {
  await login(page);
  await page.goto("/settings");
  await expect(page.getByRole("heading", { level: 2, name: "Profile" })).toBeVisible();

  const zone = page.getByRole("combobox", { name: "Time zone" });
  const suggestions = page.getByRole("listbox");
  await zone.fill("new_y");
  await expect(suggestions.getByRole("option", { name: "America/New_York" })).toBeVisible();

  await scanOpenOverlay(
    page,
    "settings time zone suggestions",
    testInfo,
    async () => {
      if (!(await suggestions.isVisible())) {
        await zone.fill("");
        await zone.fill("new_y");
      }
      await expect(suggestions.getByRole("option", { name: "America/New_York" })).toBeVisible();
    },
    '[role="listbox"]',
  );

  if (testInfo.project.name === "phone") {
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow, "page is wider than the viewport").toBeLessThanOrEqual(0);
  }

  // A zone that is not in the list still reaches the server, which refuses
  // it with a field error and saves nothing.
  await zone.fill("Mars/Olympus_Mons");
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Save profile" }).click();
  await expect(page.getByText("Pick a time zone from the list, like America/New_York.")).toBeVisible();
  await expect(zone).toHaveAttribute("aria-invalid", "true");
});

test("a saved profile comes back after a reload", async ({ page }, testInfo) => {
  // One profile per account, shared by every project: save it from one.
  test.skip(testInfo.project.name !== "chromium", "writes the shared account's profile; chromium only");

  await login(page);
  await page.goto("/settings");
  const headline = `Product designer, ${testInfo.project.name} run`;
  await page.getByLabel("Headline").fill(headline);

  const zone = page.getByRole("combobox", { name: "Time zone" });
  await zone.fill("new_y");
  await page.getByRole("option", { name: "America/New_York" }).click();
  await expect(zone).toHaveValue("America/New_York");

  await page.getByRole("button", { name: "Save profile" }).click();
  await expect(page.getByText("Profile saved.")).toBeVisible();

  await page.reload();
  await expect(page.getByLabel("Headline")).toHaveValue(headline);
  await expect(page.getByRole("combobox", { name: "Time zone" })).toHaveValue("America/New_York");
});

test("Export my data downloads one JSON file with every table and no secrets", async ({ page }) => {
  await login(page);
  await page.goto("/settings");
  const link = page.getByRole("link", { name: "Export my data" });
  await expect(link).toHaveAttribute("href", "/settings/export");

  // page.request shares the page's cookies, so this is the signed-in download
  // without depending on each engine's own download handling.
  const response = await page.request.get("/settings/export");
  expect(response.status()).toBe(200);
  expect(response.headers()["content-disposition"]).toMatch(/^attachment; filename="jobsmith-export-\d{4}-\d{2}-\d{2}\.json"$/);
  expect(response.headers()["cache-control"]).toContain("no-store");

  const body = await response.json();
  expect(body.format).toBe("jobsmith-export");
  expect(body.version).toBe(1);
  for (const key of ["companies", "opportunities", "stages", "people", "artifacts", "events", "apiTokens"]) {
    expect(Array.isArray(body[key]), `export has a ${key} list`).toBe(true);
  }
  const text = JSON.stringify(body);
  expect(text).not.toMatch(/"userId"|"password"|"tokenHash"|"hash"/);

  const origin = new URL(page.url()).origin;
  const browser = page.context().browser()!;

  // Signed out, proxy.ts turns the request away before it reaches the route.
  const anonymous = await browser.newContext();
  try {
    const redirected = await anonymous.request.get(`${origin}/settings/export`, { maxRedirects: 0 });
    expect(redirected.status()).toBe(307);
    expect(redirected.headers()["location"]).toContain("/login");
  } finally {
    await anonymous.close();
  }

  // proxy.ts only checks that a session cookie is present, so a worthless one
  // gets past it; the route's own getUser() is what answers 401 then. Same
  // forged-cookie shape as shell.spec.ts.
  const sessionCookie = (await page.context().cookies()).find((cookie) => cookie.name.endsWith(".session_token"));
  expect(sessionCookie).toBeDefined();
  const forged = await browser.newContext();
  try {
    await forged.addCookies([{ name: sessionCookie!.name, value: "garbage", url: origin, httpOnly: true, sameSite: sessionCookie!.sameSite }]);
    const refused = await forged.request.get(`${origin}/settings/export`, { maxRedirects: 0 });
    expect(refused.status()).toBe(401);
    expect(await refused.json()).toEqual({ code: "unauthorized", message: "Log in to export your data." });
  } finally {
    await forged.close();
  }
});
