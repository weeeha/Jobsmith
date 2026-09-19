import { test, expect } from "@playwright/test";
import { scanForViolations } from "./axe";
import { EMAIL, PASSWORD } from "./account";

test("first run: setup, board, logout and login round-trip", async ({ page }, testInfo) => {
  await page.goto("/");
  await expect(page).toHaveURL(/\/setup$/);
  await scanForViolations(page, "/setup", testInfo);

  await page.getByLabel("Email").fill(EMAIL);
  await page.getByLabel("Password").fill(PASSWORD);
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
