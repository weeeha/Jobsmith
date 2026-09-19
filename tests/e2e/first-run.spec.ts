import { test, expect } from "@playwright/test";
import { scanForViolations } from "./axe";
import { EMAIL, PASSWORD, SETUP_TOKEN } from "./account";

// Each test below depends on the database state the previous one left
// behind (no account, then the first account, then sign-up closed), so the
// order they're declared in matters. Serial mode makes that dependency
// explicit and stops at the first failure instead of letting a later test
// run against a state an earlier failure never produced.
test.describe.configure({ mode: "serial" });

test("the HTTP sign-up endpoint refuses to create the first account without a setup token", async ({
  page,
}) => {
  await page.goto("/setup");

  // A trusted Origin, so a 403 here comes from the setup-token gate and not
  // from the origin check.
  const response = await page.request.post("/api/auth/sign-up/email", {
    headers: { origin: new URL(page.url()).origin },
    data: { email: EMAIL, password: PASSWORD, name: "Owner" },
  });
  expect(response.status()).toBe(403);
  expect(await response.text()).toContain("Setup token required.");
});

test("the setup form rejects a wrong setup token and leaves the first-run form in place", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page).toHaveURL(/\/setup$/);

  await page.getByLabel("Email").fill(EMAIL);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByLabel("Setup token").fill("the-wrong-token-entirely");
  await page.getByRole("button", { name: "Create account" }).click();

  // Next.js also renders its own empty route announcer with role="alert", so
  // getByRole("alert") alone resolves to two elements; filter to the one
  // that actually carries the error text.
  const formAlert = page.getByRole("alert").filter({ hasText: "That setup token is not right." });
  await expect(formAlert).toHaveText("That setup token is not right.");

  // No account was created, so the page still shows the first-run form.
  await expect(page).toHaveURL(/\/setup$/);
  await expect(page.getByLabel("Email")).toBeVisible();
});

test("first run: setup, board, logout and login round-trip", async ({ page }, testInfo) => {
  await page.goto("/");
  await expect(page).toHaveURL(/\/setup$/);
  await scanForViolations(page, "/setup", testInfo);

  await page.getByLabel("Email").fill(EMAIL);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByLabel("Setup token").fill(SETUP_TOKEN);
  await page.getByRole("button", { name: "Create account" }).click();

  await expect(page).toHaveURL(/\/board$/);

  await page.goto("/setup");
  await expect(page.getByText(/this page could not be found/i)).toBeVisible();

  // The HTTP sign-up endpoint is closed as well once an account exists. The
  // request carries a trusted Origin, so a 403 here comes from the sign-up
  // gate and not from the origin check.
  const closed = await page.request.post("/api/auth/sign-up/email", {
    headers: { origin: new URL(page.url()).origin },
    data: { email: "second@example.com", password: PASSWORD, name: "Second" },
  });
  expect(closed.status()).toBe(403);
  expect(await closed.text()).toContain("Sign-up is closed.");

  // Sign-out lives in the account menu: open the trigger (its accessible
  // name is "Account menu for {email}"), then the "Sign out" item.
  await page.goto("/board");
  await page.getByRole("button", { name: /Account menu/i }).click();
  await page.getByRole("menuitem", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/login$/);
  await scanForViolations(page, "/login", testInfo);

  await page.getByLabel("Email").fill(EMAIL);
  await page.getByLabel("Password").fill("wrong password");
  await page.getByRole("button", { name: "Log in" }).click();
  // Next.js also renders its own empty route announcer with role="alert", so
  // getByRole("alert") alone resolves to two elements; filter to the one
  // that actually carries the error text.
  const formAlert = page.getByRole("alert").filter({ hasText: "Wrong email or password." });
  await expect(formAlert).toHaveText("Wrong email or password.");

  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Log in" }).click();
  await expect(page).toHaveURL(/\/board$/);
});

test("a tampered return path lands on the board, not on another site", async ({ page }) => {
  await page.goto("/login?from=//evil.example");
  await page.getByLabel("Email").fill(EMAIL);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Log in" }).click();
  await expect(page).toHaveURL(/\/board$/);
});
