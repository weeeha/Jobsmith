import { test, expect, type Page } from "@playwright/test";
import { scanForViolations } from "./axe";
import { scanOpenOverlay } from "./scan-open";
import { login, uniqueName } from "./session";

function postingWithCompanyAndRole(company: string, role: string): string {
  return `Company: ${company}\nRole: ${role}\n\nAbout the job\nWe are looking for a designer who enjoys internal tools.\n\n• Run discovery with the floor teams.\n• Ship design changes every week.`;
}

const PLAIN_POSTING_TEXT = "About the job\nWe are looking for a designer who enjoys internal tools.";

async function openAddJobDialog(page: Page) {
  await page.getByRole("button", { name: "Add job" }).click();
  const dialog = page.getByRole("dialog", { name: "Add a job" });
  await expect(dialog).toBeVisible();
  return dialog;
}

test("a LinkedIn link needs pasted text, plain text needs company and role, and a repeat add offers Add anyway then Open it", async ({
  page,
}, testInfo) => {
  test.slow();
  await login(page);

  await test.step("(a) a LinkedIn link asks for the text, then Company/Role lines and a bullet list resolve with no review notice", async () => {
    const company = uniqueName(testInfo, "Northwind Traders");
    const role = "Product Designer";

    const dialog = await openAddJobDialog(page);
    await dialog.getByLabel("Link to the posting").fill("https://www.linkedin.com/jobs/view/1000000001/");
    await dialog.getByRole("button", { name: "Add job" }).click();

    await expect(dialog.getByRole("alert")).toHaveText(
      "This site needs a login, so Jobsmith cannot read the link. Paste the posting text instead.",
    );
    await expect(dialog.getByLabel("Posting text")).toBeFocused();

    await scanOpenOverlay(page, "add job: needs the posting text", testInfo, async () => {
      if (!(await dialog.isVisible())) {
        await page.getByRole("button", { name: "Add job" }).click();
      }
      await expect(dialog).toBeVisible();
    });

    await dialog.getByLabel("Posting text").fill(postingWithCompanyAndRole(company, role));
    await dialog.getByRole("button", { name: "Add job" }).click();
    await expect(dialog).toBeHidden();
    await expect(page.getByRole("link", { name: `${role} at ${company}` })).toBeVisible();

    await page.getByRole("link", { name: `${role} at ${company}` }).click();
    await expect(page).toHaveURL(/\/jobs\//);
    await expect(
      page.getByRole("listitem").filter({ hasText: "Run discovery with the floor teams." }),
    ).toBeVisible();
    await expect(page.getByText("Check this job's details.")).toHaveCount(0);
  });

  await test.step("(b) plain text needs company and role, and the saved job carries the review notice until Mark as checked", async () => {
    const company = uniqueName(testInfo, "Riverbend Studio");
    const role = "Senior Designer";

    await page.goto("/board");
    const dialog = await openAddJobDialog(page);
    await dialog.getByLabel("Posting text").fill(PLAIN_POSTING_TEXT);
    await dialog.getByRole("button", { name: "Add job" }).click();

    await expect(dialog.getByRole("alert")).toHaveText(
      "Jobsmith could not read the company and role from the posting. Add them to save the job.",
    );
    await expect(dialog.getByLabel("Company")).toBeFocused();

    await scanOpenOverlay(page, "add job: needs company and role", testInfo, async () => {
      if (!(await dialog.isVisible())) {
        await page.getByRole("button", { name: "Add job" }).click();
      }
      await expect(dialog).toBeVisible();
    });

    await dialog.getByLabel("Company").fill(company);
    await dialog.getByLabel("Role").fill(role);
    await dialog.getByRole("button", { name: "Add job" }).click();
    await expect(dialog).toBeHidden();

    await page.getByRole("link", { name: `${role} at ${company}` }).click();
    await expect(page).toHaveURL(/\/jobs\//);

    await expect(
      page.getByText("Check this job's details. They were not read from the posting automatically."),
    ).toBeVisible();
    await scanForViolations(page, "job page with the review notice", testInfo);

    await page.getByRole("button", { name: "Mark as checked" }).click();
    await expect(page.getByText("Check this job's details.")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Job actions" })).toBeFocused();
  });

  await test.step("(c) a manual job added twice offers Add anyway, then a third attempt offers Open it", async () => {
    const company = uniqueName(testInfo, "Harborview Systems");
    const role = "Design Lead";

    await page.goto("/board");
    let dialog = await openAddJobDialog(page);
    await dialog.getByLabel("Company").fill(company);
    await dialog.getByLabel("Role").fill(role);
    await dialog.getByRole("button", { name: "Add job" }).click();
    await expect(dialog).toBeHidden();

    dialog = await openAddJobDialog(page);
    await dialog.getByLabel("Company").fill(company);
    await dialog.getByLabel("Role").fill(role);
    await dialog.getByRole("button", { name: "Add job" }).click();

    await expect(dialog.getByRole("alert")).toContainText("You already have this job.");
    await expect(dialog.getByRole("button", { name: "Add anyway" })).toBeFocused();

    await scanOpenOverlay(page, "add job: duplicate", testInfo, async () => {
      if (!(await dialog.isVisible())) {
        await page.getByRole("button", { name: "Add job" }).click();
        await dialog.getByLabel("Company").fill(company);
        await dialog.getByLabel("Role").fill(role);
        await dialog.getByRole("button", { name: "Add job" }).click();
      }
      await expect(dialog).toBeVisible();
    });

    await dialog.getByRole("button", { name: "Add anyway" }).click();
    await expect(dialog).toBeHidden();
    await expect(page.getByRole("link", { name: `${role} at ${company}` })).toHaveCount(2);

    dialog = await openAddJobDialog(page);
    await dialog.getByLabel("Company").fill(company);
    await dialog.getByLabel("Role").fill(role);
    await dialog.getByRole("button", { name: "Add job" }).click();
    await expect(dialog.getByRole("alert")).toContainText("You already have this job.");

    await dialog.getByRole("link", { name: "Open it" }).click();
    await expect(page).toHaveURL(/\/jobs\//);
  });
});
