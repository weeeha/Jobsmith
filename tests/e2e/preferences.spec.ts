import { test, expect } from "@playwright/test";
import { scanForViolations } from "./axe";
import { scanInPlace } from "./scan-in-place";
import { login, uniqueName } from "./session";

test("a target below the floor is refused field by field, and nothing is saved", async ({ page }, testInfo) => {
  await login(page);
  await page.goto("/preferences");
  await expect(page.getByRole("heading", { level: 1, name: "Preferences" })).toBeVisible();
  await expect(page.getByRole("heading", { level: 2, name: "Hard filters" })).toBeVisible();

  await page.getByLabel("Pay floor").fill("150,000");
  await page.getByLabel("Target pay").fill("120000");
  await page.getByLabel("Follow up after").fill("0");
  await page.getByRole("button", { name: "Save preferences" }).click();

  const target = page.getByLabel("Target pay");
  await expect(page.getByText("The target can't be below the floor.")).toBeVisible();
  await expect(target).toHaveAttribute("aria-invalid", "true");
  await expect(page.getByText("Enter a whole number of days from 1 to 60.")).toBeVisible();
  await scanInPlace(page, "preferences field errors", testInfo);

  if (testInfo.project.name === "phone") {
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow, "page is wider than the viewport").toBeLessThanOrEqual(0);
  }

  // A refused save writes nothing, so a fresh load shows no error and no "0".
  await page.reload();
  await expect(page.getByText("The target can't be below the floor.")).toHaveCount(0);
  await expect(page.getByLabel("Follow up after")).not.toHaveValue("0");
});

test("saved preferences come back after a reload", async ({ page }, testInfo) => {
  // One preferences document per account, and every project shares the
  // account: a save from two browsers at once would race. The refusal test
  // above writes nothing, so it runs on every engine; this one runs once.
  test.skip(testInfo.project.name !== "chromium", "writes the shared account's preferences; chromium only");

  await login(page);
  await page.goto("/preferences");
  const title = uniqueName(testInfo, "Design Systems Lead");

  const titles = page.getByLabel("Title keywords");
  await titles.fill(title);
  await titles.press("Enter");
  // Enter adds a chip; it must not submit the form.
  await expect(page.getByRole("button", { name: `Remove ${title}` })).toBeVisible();
  await expect(page.getByText("Preferences saved.")).toHaveCount(0);

  const remote = page.getByRole("button", { name: "Remote", exact: true });
  if ((await remote.getAttribute("aria-pressed")) !== "true") await remote.click();
  await expect(remote).toHaveAttribute("aria-pressed", "true");
  await page.getByLabel("Pay floor").fill("140000");
  await page.getByLabel("Target pay").fill("175000");

  await page.getByRole("button", { name: "Save preferences" }).click();
  await expect(page.getByRole("region", { name: /^Notifications/ }).getByText("Preferences saved.")).toBeVisible();

  await scanForViolations(page, "preferences", testInfo);
  await expect(page.getByRole("button", { name: `Remove ${title}` })).toBeVisible();
  await expect(page.getByRole("button", { name: "Remote", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByLabel("Pay floor")).toHaveValue(/140,?000/);
  await expect(page.getByLabel("Target pay")).toHaveValue(/175,?000/);

  // Leave the list as it was, so the next run starts from the same place.
  await page.getByRole("button", { name: `Remove ${title}` }).click();
  await page.getByRole("button", { name: "Save preferences" }).click();
  await expect(page.getByRole("region", { name: /^Notifications/ }).getByText("Preferences saved.")).toBeVisible();
});
