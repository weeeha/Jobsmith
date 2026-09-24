import { test, expect, type TestInfo } from "@playwright/test";
import { scanForViolations } from "./axe";
import { scanOpenOverlay } from "./scan-open";
import { EMAIL, PASSWORD } from "./account";

function uniqueName(testInfo: TestInfo, base: string): string {
  const suffix = Math.random().toString(36).slice(2, 8);
  return `${base} ${testInfo.project.name} ${suffix}`;
}

test("phone: the board renders as a grouped list, and Move to opens a sheet", async ({ page }, testInfo) => {
  test.skip(
    testInfo.project.name !== "phone",
    "phone board only; playwright.config.ts also restricts this file to the phone project",
  );

  await page.goto("/login");
  await page.getByLabel("Email").fill(EMAIL);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Log in" }).click();
  await expect(page).toHaveURL(/\/board$/);

  const company = uniqueName(testInfo, "Lumen Health");
  const role = "Product Design Manager";
  await page.getByRole("button", { name: "Add job" }).click();
  const dialog = page.getByRole("dialog", { name: "Add a job" });
  await dialog.getByLabel("Company").fill(company);
  await dialog.getByLabel("Role").fill(role);
  await dialog.getByRole("button", { name: "Add job" }).click();
  await expect(dialog).toBeHidden();

  const cardName = `${role} at ${company}`;
  await expect(page.getByRole("heading", { name: "Saved" })).toBeVisible();
  // Not getByText(cardName): the row's own two spans (role, then "at
  // <company>") join with no space between them in the accessibility tree's
  // text, so that query never matches the row - it was instead passing on
  // the live region's own "Added <cardName>." announcement, still on screen
  // at this point, which is a coincidence of wording, not proof the phone
  // list actually shows the job. Scoped to the visible "Saved" group (the
  // desktop board's own same-titled column sits in the DOM too, just
  // display:none below this breakpoint) and queried by the row link's own
  // role and full accessible name instead, the way the Applied check below
  // already does after the move.
  const savedGroup = page
    .locator("section:visible")
    .filter({ has: page.getByRole("heading", { name: "Saved", exact: true }) });
  await expect(savedGroup.getByRole("link", { name: cardName })).toBeVisible();
  await scanForViolations(page, "phone list", testInfo);

  await page.getByRole("button", { name: `Move ${role} at ${company}` }).click();
  const sheet = page.getByRole("dialog", { name: "Move to" });
  await expect(sheet).toBeVisible();

  await scanOpenOverlay(page, "move sheet", testInfo, async () => {
    if (!(await sheet.isVisible())) {
      await page.getByRole("button", { name: `Move ${role} at ${company}` }).click();
    }
    await expect(sheet).toBeVisible();
  });

  await sheet.getByRole("button", { name: "Applied" }).click();
  await expect(sheet).toBeHidden();
  await expect(page.getByRole("heading", { name: "Applied" })).toBeVisible();

  // The board is shared with whatever the other browser projects are doing
  // at the same time, so some other run's own card can already have put an
  // Applied group on screen - the heading check above passes either way and
  // cannot by itself show that THIS card actually moved. Each stage group
  // on this list carries no accessible name of its own (unlike the desktop
  // board's columns), so the group a heading belongs to is found by
  // walking up from that heading, restricted to the currently visible
  // section so the desktop board's own same-titled column - present in the
  // DOM but display:none below this breakpoint - cannot be the one that
  // matches. The card is then looked up by its link role and full name
  // (rather than by a text substring, which its two-line layout would
  // split across elements) inside that one group only.
  const appliedGroup = page
    .locator("section:visible")
    .filter({ has: page.getByRole("heading", { name: "Applied", exact: true }) });
  await expect(appliedGroup.getByRole("link", { name: cardName })).toBeVisible();
});
