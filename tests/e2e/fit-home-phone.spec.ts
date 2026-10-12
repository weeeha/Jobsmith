import { test, expect } from "@playwright/test";
import { scanForViolations } from "./axe";
import { addJobOnBoard, login, uniqueName } from "./session";

test("phone: Home, Preferences and Settings fit the screen and pass axe, and a move through the sheet offers the dialog", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "phone", "phone only; playwright.config.ts also restricts this file to the phone project");
  test.slow();
  await login(page);

  for (const [path, heading] of [
    ["/", "Home"],
    ["/preferences", "Preferences"],
    ["/settings", "Settings"],
  ] as const) {
    await page.goto(path);
    await expect(page.getByRole("heading", { level: 1, name: heading })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      await page.evaluate(() => window.innerWidth),
    );
    await scanForViolations(page, `phone ${path}`, testInfo);
  }

  await page.goto("/board");
  const company = uniqueName(testInfo, "Lumen Health");
  const role = "Product Design Manager";
  await addJobOnBoard(page, company, role);

  await page.getByRole("button", { name: `Move ${role} at ${company}` }).click();
  const sheet = page.getByRole("dialog", { name: "Move to" });
  await expect(sheet).toBeVisible();
  await sheet.getByRole("button", { name: "Applied" }).click();
  await expect(sheet).toBeHidden();

  await expect(page.getByText(`What is next for ${role} at ${company}?`)).toBeVisible();
  await page.getByRole("button", { name: "Set next action" }).click();
  const dialog = page.getByRole("dialog", { name: "Set the next action" });
  await expect(dialog).toBeVisible();
  await dialog.getByLabel("What is next").fill("Send the portfolio link");
  await dialog.getByRole("button", { name: "Save" }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByRole("button", { name: `Move ${role} at ${company}` })).toBeFocused();
});
