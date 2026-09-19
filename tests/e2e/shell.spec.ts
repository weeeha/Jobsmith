import { test, expect } from "@playwright/test";
import { scanForViolations } from "./axe";
import { EMAIL, PASSWORD } from "./account";

const COLUMN_TITLES = [
  "Saved",
  "Applied",
  "Recruiter",
  "Hiring manager",
  "Portfolio / case",
  "Panel / final",
  "Offer",
];

test("shell: login, board, home, navigation and accessibility", async ({ page }, testInfo) => {
  await test.step("an unauthenticated visit is sent to login and returns to the board", async () => {
    await page.goto("/board");
    await expect(page).toHaveURL(/\/login\?from=%2Fboard$/);
    await page.getByLabel("Email").fill(EMAIL);
    await page.getByLabel("Password").fill(PASSWORD);
    await page.getByRole("button", { name: "Log in" }).click();
    await expect(page).toHaveURL(/\/board$/);
  });

  await test.step("the board shows its seven empty columns", async () => {
    for (const title of COLUMN_TITLES) {
      await expect(page.getByRole("heading", { name: title })).toBeVisible();
    }
    await scanForViolations(page, "/board", testInfo);
  });

  await test.step("the /board response carries the app's baseline security headers", async () => {
    const response = await page.goto("/board");
    expect(response?.headers()["content-security-policy"]).toBe("frame-ancestors 'none'");
    expect(response?.headers()["referrer-policy"]).toBe("strict-origin-when-cross-origin");
  });

  await test.step("home renders", async () => {
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "Home" })).toBeVisible();
    await scanForViolations(page, "/ (Home)", testInfo);
  });

  await test.step("navigation matches the viewport", async () => {
    await page.goto("/board");
    const bottomTabs = page.getByRole("navigation", { name: "Primary" });
    if (testInfo.project.name === "phone") {
      // Below the md breakpoint the sidebar is a closed sheet that mounts no
      // content, and the bottom tab bar is the only navigation on screen.
      await expect(bottomTabs).toBeVisible();
      await expect(bottomTabs.getByRole("link", { name: "Board" })).toBeVisible();
    } else {
      await expect(bottomTabs).toBeHidden();
      await expect(page.getByRole("link", { name: "Board" }).first()).toBeVisible();
    }
  });
});

test("a forged session cookie does not bypass the page's own check", async ({
  page,
  context,
  browser,
}) => {
  // Log in for real first, so the cookie name below comes from an actual
  // logged-in context in this file rather than a guess: better-auth names it
  // "better-auth.session_token" by default (dist/cookies/index.mjs), with a
  // "__Secure-" prefix only when the app's base URL is https, which the
  // end-to-end suite's http://localhost baseURL is not.
  await page.goto("/login");
  await page.getByLabel("Email").fill(EMAIL);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Log in" }).click();
  await expect(page).toHaveURL(/\/board$/);

  const cookies = await context.cookies();
  const sessionCookie = cookies.find((cookie) => cookie.name.endsWith(".session_token"));
  expect(sessionCookie).toBeDefined();

  // proxy.ts only checks that a cookie with this name is present, so it lets
  // this request through to the page itself. A fresh, otherwise
  // unauthenticated context that presents the right-named cookie with a
  // worthless value is exactly what the page's own check (requireUser() ->
  // auth.api.getSession(), not the proxy) has to reject on its own.
  const forgedContext = await browser.newContext();
  await forgedContext.addCookies([
    {
      name: sessionCookie!.name,
      value: "garbage",
      url: new URL(page.url()).origin,
      httpOnly: sessionCookie!.httpOnly,
      sameSite: sessionCookie!.sameSite,
      secure: sessionCookie!.secure,
    },
  ]);

  const forgedPage = await forgedContext.newPage();
  await forgedPage.goto("/board");
  await expect(forgedPage).toHaveURL(/\/login/);

  await forgedContext.close();
});
