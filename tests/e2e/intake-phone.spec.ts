import { test, expect } from "@playwright/test";
import { scanOpenOverlay } from "./scan-open";
import { login, uniqueName } from "./session";

test("phone: a LinkedIn link needs the posting text, with no page-level horizontal overflow in the dialog", async ({
  page,
}, testInfo) => {
  test.skip(
    testInfo.project.name !== "phone",
    "phone board only; playwright.config.ts also restricts this file to the phone project",
  );

  await login(page);
  const company = uniqueName(testInfo, "Northwind Traders");
  const role = "Product Designer";

  await page.getByRole("button", { name: "Add job" }).click();
  const dialog = page.getByRole("dialog", { name: "Add a job" });
  await expect(dialog).toBeVisible();

  await dialog.getByLabel("Link to the posting").fill("https://www.linkedin.com/jobs/view/1000000001/");
  await dialog.getByRole("button", { name: "Add job" }).click();
  await expect(dialog.getByRole("alert")).toHaveText(
    "This site needs a login, so Jobsmith cannot read the link. Paste the posting text instead.",
  );

  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
    await page.evaluate(() => window.innerWidth),
  );

  await scanOpenOverlay(page, "phone add job: needs the posting text", testInfo, async () => {
    if (!(await dialog.isVisible())) {
      await page.getByRole("button", { name: "Add job" }).click();
    }
    await expect(dialog).toBeVisible();
  });

  await dialog.getByLabel("Posting text").fill(
    `Company: ${company}\nRole: ${role}\n\nAbout the job\nWe are looking for a designer who enjoys internal tools.\n\n• Run discovery with the floor teams.\n• Ship design changes every week.`,
  );
  await dialog.getByRole("button", { name: "Add job" }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByRole("link", { name: `${role} at ${company}` })).toBeVisible();
});
