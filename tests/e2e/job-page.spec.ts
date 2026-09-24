import { test, expect, type Page, type Locator, type TestInfo } from "@playwright/test";
import { scanForViolations } from "./axe";
import { scanOpenOverlay } from "./scan-open";
import { EMAIL, PASSWORD } from "./account";

function uniqueName(testInfo: TestInfo, base: string): string {
  const suffix = Math.random().toString(36).slice(2, 8);
  return `${base} ${testInfo.project.name} ${suffix}`;
}

// A fixed calendar value rots: run this suite again after the date passes
// and scheduling a stage with a value that is no longer in the future
// silently stops moving the stage to "scheduled" (lib/pipeline/schedule.ts
// only writes that status, and the interview_scheduled event, when the
// value is later than the server's own clock). Fourteen days out keeps the
// value comfortably in the future for any reasonable time this suite runs,
// without hardcoding a calendar date. Formatted the same way
// lib/time/local.ts's toLocalInputValue reads a Date back out (local
// getters, zero-padded), since that is what the datetime-local input holds.
function futureLocalDateTimeValue(daysAhead: number): string {
  const future = new Date(Date.now() + daysAhead * 24 * 60 * 60 * 1000);
  const pad = (n: number) => String(n).padStart(2, "0");
  const year = future.getFullYear();
  const month = pad(future.getMonth() + 1);
  const day = pad(future.getDate());
  return `${year}-${month}-${day}T09:30`;
}

async function login(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(EMAIL);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Log in" }).click();
  await expect(page).toHaveURL(/\/board$/);
}

async function addJobAndOpen(page: Page, company: string, role: string) {
  await page.getByRole("button", { name: "Add job" }).click();
  const dialog = page.getByRole("dialog", { name: "Add a job" });
  await expect(dialog).toBeVisible();
  await dialog.getByLabel("Company").fill(company);
  await dialog.getByLabel("Role").fill(role);
  await dialog.getByRole("button", { name: "Add job" }).click();
  await expect(dialog).toBeHidden();
  await page.getByRole("link", { name: `${role} at ${company}` }).click();
  await expect(page).toHaveURL(/\/jobs\//);
}

async function chooseOption(page: Page, scope: Locator, triggerLabel: string, optionText: string) {
  await scope.getByRole("combobox", { name: triggerLabel }).click();
  await page.getByRole("option", { name: optionText, exact: true }).click();
}

test("the stepper opens a stage sheet, Move here advances it, and the timeline records the move", async ({
  page,
}, testInfo) => {
  await login(page);
  const company = uniqueName(testInfo, "Lumen Health");
  const role = "Principal Product Designer";
  await addJobAndOpen(page, company, role);

  await page.getByRole("button", { name: "Applied, upcoming" }).click();
  const sheet = page.getByRole("dialog", { name: "Applied" });
  await expect(sheet).toBeVisible();

  await scanOpenOverlay(page, "stage sheet", testInfo, async () => {
    if (!(await sheet.isVisible())) {
      await page.getByRole("button", { name: "Applied, upcoming" }).click();
    }
    await expect(sheet).toBeVisible();
  });

  await sheet.getByRole("button", { name: "Move here" }).click();
  await expect(sheet).toBeHidden();
  await expect(page.getByRole("button", { name: "Applied, current" })).toBeVisible();

  await page.getByRole("tab", { name: "Timeline" }).click();
  await expect(page.getByText("Moved from Saved to Applied.")).toBeVisible();
});

test("edit stages: add a Take-home stage, rename, skip and remove it; schedule the current stage", async ({
  page,
}, testInfo) => {
  await login(page);
  const company = uniqueName(testInfo, "Acme Robotics");
  const role = "Staff Product Designer";
  await addJobAndOpen(page, company, role);

  await page.getByRole("button", { name: "Edit stages" }).click();
  const dialog = page.getByRole("dialog", { name: "Edit stages" });
  await expect(dialog).toBeVisible();

  await scanOpenOverlay(page, "edit stages dialog", testInfo, async () => {
    if (!(await dialog.isVisible())) {
      await page.getByRole("button", { name: "Edit stages" }).click();
    }
    await expect(dialog).toBeVisible();
  });

  await chooseOption(page, dialog, "Kind", "Portfolio / case");
  await dialog.getByLabel("Label").fill("Take-home");
  await dialog.getByRole("button", { name: "Add stage" }).click();
  await expect(dialog.getByRole("textbox", { name: "Rename Take-home" })).toBeVisible();

  const renameInput = dialog.getByRole("textbox", { name: "Rename Take-home" });
  await renameInput.fill("Portfolio deep dive");
  await renameInput.press("Enter");
  await expect(dialog.getByRole("textbox", { name: "Rename Portfolio deep dive" })).toBeVisible();

  await dialog.getByRole("button", { name: "Skip Portfolio deep dive" }).click();
  await expect(dialog.getByRole("button", { name: "Unskip Portfolio deep dive" })).toBeVisible();

  await dialog.getByRole("button", { name: "Remove Portfolio deep dive" }).click();
  await expect(dialog.getByRole("textbox", { name: "Rename Portfolio deep dive" })).toBeHidden();

  await dialog.getByRole("button", { name: "Done" }).click();
  await expect(dialog).toBeHidden();

  await page.getByRole("button", { name: "Saved, current" }).click();
  const sheet = page.getByRole("dialog", { name: "Saved" });
  await expect(sheet).toBeVisible();
  await sheet.getByLabel("Date and time").fill(futureLocalDateTimeValue(14));
  await chooseOption(page, sheet, "Format", "Video");
  await sheet.getByRole("button", { name: "Save" }).click();
  await expect(sheet).toBeHidden();

  // A future date is what actually flips the stage to "scheduled" and
  // writes the interview_scheduled event (lib/pipeline/schedule.ts); the
  // stepper's own button keeps reading "Saved, current" either way (current
  // wins over the stored status there), so the timeline is the only place
  // that shows whether the save above really scheduled anything rather than
  // merely closing the sheet.
  await page.getByRole("tab", { name: "Timeline" }).click();
  await expect(page.getByText("Saved scheduled.")).toBeVisible();
});

test("next action, people and notes, with axe across all three tabs", async ({ page }, testInfo) => {
  await login(page);
  const company = uniqueName(testInfo, "Northwind Labs");
  const role = "Engineering Manager";
  await addJobAndOpen(page, company, role);

  await page.getByRole("button", { name: "Add" }).click();
  await page.getByLabel("What is next").fill("Send a thank-you note");
  // exact: true - unscoped, "Save" would also match the stepper's own
  // "Saved, current" button (accessible names match by substring by
  // default, and "Saved, current" contains "Save").
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByText("Send a thank-you note")).toBeVisible();
  await page.getByRole("button", { name: "Done" }).click();
  await expect(page.getByText("No next action.")).toBeVisible();

  await scanForViolations(page, "job page overview tab", testInfo);

  await page.getByRole("tab", { name: "People" }).click();
  // JobTabs switches tabs with router.push, a soft navigation whose new
  // server-rendered content (and the URL that names it) lands some time
  // after the click's own promise resolves, not within it - confirmed by
  // reading page.url() right after this same click, which still showed the
  // previous tab's URL. scanForViolations's first move is a full reload of
  // whatever URL is current at that moment, so without this wait it can
  // reload back onto the tab this test just navigated away from, and the
  // People tab's own content - including the button clicked right below -
  // never appears at all.
  await page.waitForURL(/tab=people/);
  await scanForViolations(page, "job page people tab", testInfo);
  await page.getByRole("button", { name: "Add person" }).click();
  const personDialog = page.getByRole("dialog", { name: "Add a person" });
  await expect(personDialog).toBeVisible();
  await personDialog.getByLabel("Name").fill("Priya Raman");
  await chooseOption(page, personDialog, "Role in this process", "Recruiter");
  await personDialog.getByRole("button", { name: "Save" }).click();
  await expect(personDialog).toBeHidden();
  await expect(page.getByText("Priya Raman")).toBeVisible();

  await page.getByRole("tab", { name: "Timeline" }).click();
  // See the People tab's own wait above for why this is needed before a
  // scanForViolations reload.
  await page.waitForURL(/tab=timeline/);
  await scanForViolations(page, "job page timeline tab", testInfo);
  await page.getByLabel("Add a note").fill("Left a voicemail for the recruiter.");
  await page.getByRole("button", { name: "Add note" }).click();
  await expect(page.getByText("Left a voicemail for the recruiter.")).toBeVisible();
  await expect(page.getByText("Done: Send a thank-you note.")).toBeVisible();
});

test("edit details: a pay figure the browser cannot read keeps the saved one", async ({ page }, testInfo) => {
  await login(page);
  const company = uniqueName(testInfo, "Kestrel Freight");
  const role = "Design Lead";

  await page.getByRole("button", { name: "Add job" }).click();
  const addDialog = page.getByRole("dialog", { name: "Add a job" });
  await expect(addDialog).toBeVisible();
  await addDialog.getByLabel("Company").fill(company);
  await addDialog.getByLabel("Role").fill(role);
  await addDialog.getByLabel("Pay from").fill("120000");
  await addDialog.getByLabel("Pay to").fill("150000");
  await addDialog.getByRole("button", { name: "Add job" }).click();
  await expect(addDialog).toBeHidden();
  await page.getByRole("link", { name: `${role} at ${company}` }).click();
  await expect(page).toHaveURL(/\/jobs\//);
  await expect(page.getByText("120,000–150,000")).toBeVisible();

  await page.getByRole("button", { name: "Job actions" }).click();
  await page.getByRole("menuitem", { name: "Edit details" }).click();
  const dialog = page.getByRole("dialog", { name: "Edit details" });
  await expect(dialog).toBeVisible();
  // Select the saved figure and type over it key by key, as a person would
  // (fill() refuses text a number box cannot parse). The box shows "125e"
  // while the browser reports its value as "" (validity.badInput).
  const payFrom = dialog.getByLabel("Pay from");
  await payFrom.click();
  await page.keyboard.press("ControlOrMeta+a");
  await payFrom.pressSequentially("125e");
  await dialog.getByRole("button", { name: "Save" }).click();

  await expect(dialog.getByRole("alert")).toHaveText("Check the highlighted fields.");
  await expect(payFrom).toHaveAccessibleDescription("Enter a number.");
  await expect(payFrom).toHaveAttribute("aria-invalid", "true");

  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await page.reload();
  await expect(page.getByText("120,000–150,000")).toBeVisible();
});
