import { test, expect } from "@playwright/test";
import { scanForViolations } from "./axe";
import { EMAIL, PASSWORD } from "./account";

test("shell: login, board, home, navigation and accessibility", async ({ page }, testInfo) => {
  await test.step("an unauthenticated visit is sent to login and returns to the board", async () => {
    await page.goto("/board");
    await expect(page).toHaveURL(/\/login\?from=%2Fboard$/);
    await page.getByLabel("Email").fill(EMAIL);
    await page.getByLabel("Password").fill(PASSWORD);
    await page.getByRole("button", { name: "Log in" }).click();
    await expect(page).toHaveURL(/\/board$/);
  });

  await test.step("the board shows its empty state for a new, zero-job account", async () => {
    // This account never has any opportunities seeded anywhere in this
    // suite (first-run.spec.ts only ever creates the account itself), so
    // both Board and PhoneBoard render EmptyState's identical copy - title,
    // description and "Add job" action - instead of seven columns or a
    // grouped list (Task 9). Board and PhoneBoard both mount unconditionally
    // now, one on each side of the `md` breakpoint (`hidden md:flex` /
    // `flex md:hidden`), so the same text exists twice in the DOM at once -
    // only one copy is ever actually visible, whichever the current
    // viewport exposes, so `.filter({ visible: true })` is what picks out
    // the one under test here rather than relying on which happens to come
    // first in DOM order. This replaces the previous phone-only branch,
    // which asserted the text was hidden everywhere on phone - true before
    // PhoneBoard existed, false now.
    await expect(page.getByText("No jobs yet").filter({ visible: true })).toBeVisible();
    await expect(page.getByText("Add the first job you are tracking.").filter({ visible: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Add job" }).filter({ visible: true })).toBeVisible();
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
