import { test, expect, type Page } from "@playwright/test";
import { scanForViolations } from "./axe";
import { scanOpenOverlay } from "./scan-open";
import { login, uniqueName, addJobAndOpen } from "./session";

// A next action two days in the past, as the "When" field's own
// datetime-local text. Any past instant is due in every time zone, so this
// holds whatever zone another spec leaves on the shared account's profile;
// the "Overdue" versus "Due today" wording does depend on that zone, which
// is why nothing below asserts it.
function twoDaysAgo(): string {
  const at = new Date(Date.now() - 2 * 86_400_000);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())}T${pad(at.getHours())}:${pad(at.getMinutes())}`;
}

async function addOverdueJob(page: Page, company: string, role: string, nextAction: string) {
  await addJobAndOpen(page, company, role);
  await page.getByRole("button", { name: "Add" }).click();
  await page.getByLabel("What is next").fill(nextAction);
  await page.getByLabel("When").fill(twoDaysAgo());
  // exact: see job-page.spec.ts, "Saved, current" also contains "Save".
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByText(nextAction)).toBeVisible();
}

// Every row's actions sit in a group named after its job, so a test can find
// its own row on an account other projects are adding jobs to at the same time.
const actionsFor = (page: Page, role: string, company: string) =>
  page.getByRole("group", { name: `Actions for ${role} at ${company}` });

async function expectNoHorizontalScroll(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow, "page is wider than the viewport").toBeLessThanOrEqual(0);
}

test("a due next action shows on Home, and Mark done clears it", async ({ page }, testInfo) => {
  await login(page);
  const company = uniqueName(testInfo, "Halcyon Labs");
  const role = "Senior Product Designer";
  const nextAction = uniqueName(testInfo, "Send the case study");
  await addOverdueJob(page, company, role, nextAction);

  await page.goto("/");
  const actions = actionsFor(page, role, company);
  const row = page.getByRole("listitem").filter({ has: actions });
  await expect(row).toContainText(nextAction);
  await expect(page.getByRole("heading", { level: 2, name: /Due today or overdue/ })).toBeVisible();

  await scanForViolations(page, "home with items", testInfo);
  if (testInfo.project.name === "phone") await expectNoHorizontalScroll(page);

  await actions.getByRole("button", { name: "Mark done" }).click();
  await expect(actions).toHaveCount(0);

  // The write went through the pipeline, so the job page agrees.
  await page.goto("/board");
  await page.getByRole("link", { name: `${role} at ${company}` }).click();
  await expect(page.getByText("No next action.")).toBeVisible();
});

test("Snooze moves a due item out of today and says where it went", async ({ page }, testInfo) => {
  await login(page);
  const company = uniqueName(testInfo, "Pinecrest Health");
  const role = "Design Lead";
  const nextAction = uniqueName(testInfo, "Chase the recruiter");
  await addOverdueJob(page, company, role, nextAction);

  await page.goto("/");
  const actions = actionsFor(page, role, company);
  const snooze = actions.getByRole("button", { name: "Snooze" });
  const menu = page.getByRole("menu");

  await scanOpenOverlay(
    page,
    "home snooze menu",
    testInfo,
    async () => {
      if (!(await menu.isVisible())) await snooze.click();
      await expect(menu).toBeVisible();
    },
    '[role="menu"]',
  );
  await expect(menu.getByRole("menuitem")).toHaveText(["Tomorrow", "In 3 days", "Next week"]);

  // In 3 days, not Tomorrow: Tomorrow at 09:00 in one zone can still fall
  // inside "today" in another, and another spec may change the profile's zone
  // while this one runs. Three days out is past today in every zone.
  await menu.getByRole("menuitem", { name: "In 3 days" }).click();
  await expect(page.getByText(/^Snoozed to \w+ \d+ \w+\.$/)).toBeVisible();
  await expect(actions).toHaveCount(0);
});
