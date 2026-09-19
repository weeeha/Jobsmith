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
