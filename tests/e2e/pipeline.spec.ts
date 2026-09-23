import { test, expect, type Page, type TestInfo } from "@playwright/test";
import { scanForViolations } from "./axe";
import { scanOpenOverlay } from "./scan-open";
import { EMAIL, PASSWORD } from "./account";

function uniqueName(testInfo: TestInfo, base: string): string {
  const suffix = Math.random().toString(36).slice(2, 8);
  return `${base} ${testInfo.project.name} ${suffix}`;
}

async function login(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(EMAIL);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Log in" }).click();
  await expect(page).toHaveURL(/\/board$/);
}

async function addJob(page: Page, company: string, role: string) {
  await page.getByRole("button", { name: "Add job" }).click();
  const dialog = page.getByRole("dialog", { name: "Add a job" });
  await expect(dialog).toBeVisible();
  await dialog.getByLabel("Company").fill(company);
  await dialog.getByLabel("Role").fill(role);
  await dialog.getByRole("button", { name: "Add job" }).click();
  await expect(dialog).toBeHidden();
}

// dnd-kit's PointerSensor needs real intermediate pointer moves and more
// than 5 pixels of travel before it recognizes a drag; a single mouse.move
// straight to the target does not trigger it. A column's own container is
// exposed as a "region" whose accessible name starts with the column
// title in both states (a card-bearing column and the empty rail's
// "<column>, no jobs"), so one query locates the drop target either way;
// the drop lands on that region's own bounding box center.
async function dragCardToColumn(page: Page, cardName: string, columnName: string) {
  const card = page.getByRole("link", { name: cardName });
  const column = page.getByRole("region", { name: new RegExp("^" + columnName + ",") });
  const cardBox = await card.boundingBox();
  const columnBox = await column.boundingBox();
  if (!cardBox || !columnBox) {
    throw new Error(`dragCardToColumn: could not locate "${cardName}" or column "${columnName}"`);
  }
  const start = { x: cardBox.x + cardBox.width / 2, y: cardBox.y + cardBox.height / 2 };
  const end = { x: columnBox.x + columnBox.width / 2, y: columnBox.y + columnBox.height / 2 };

  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  const steps = 12;
  for (let i = 1; i <= steps; i++) {
    await page.mouse.move(start.x + ((end.x - start.x) * i) / steps, start.y + ((end.y - start.y) * i) / steps);
  }
  await page.mouse.up();
}

test("add a job by hand, drag it to Applied, and the timeline shows the move", async ({ page }, testInfo) => {
  await login(page);

  const company = uniqueName(testInfo, "Acme Robotics");
  const role = "Product Designer";
  const cardName = `${role} at ${company}`;

  await addJob(page, company, role);
  await expect(page.getByRole("link", { name: cardName })).toBeVisible();
  await scanForViolations(page, "board with cards", testInfo);

  await scanOpenOverlay(page, "add dialog", testInfo, async () => {
    const dialog = page.getByRole("dialog", { name: "Add a job" });
    if (!(await dialog.isVisible())) {
      await page.getByRole("button", { name: "Add job" }).click();
    }
    await expect(dialog).toBeVisible();
  });
  await page.keyboard.press("Escape");
  // The dialog's own closing transition leaves its overlay intercepting
  // pointer events for a moment after Escape is pressed - confirmed by
  // checking document.elementFromPoint at the card's own coordinates right
  // after Escape, which still returned the overlay, not the card - so a
  // drag started too early never reaches dnd-kit's sensor at all and
  // silently does nothing. Waiting for the dialog to actually leave the
  // accessibility tree avoids starting the drag on top of it.
  await expect(page.getByRole("dialog", { name: "Add a job" })).toBeHidden();

  await dragCardToColumn(page, cardName, "Applied");
  await expect(page.getByText(`Moved ${role} at ${company} to Applied.`)).toBeAttached();
  // dnd-kit's DragOverlay keeps rendering the dragged card's content for its
  // own drop animation for a short moment after the drop, alongside the
  // real card now sitting in its column - confirmed by inspecting the DOM
  // right after a drop, which briefly had two matching links. The move
  // announcement above can land before that animation finishes, so this
  // waits for the duplicate to resolve before the click below has to pick
  // one.
  await expect(page.getByRole("link", { name: cardName })).toHaveCount(1);

  await page.getByRole("link", { name: cardName }).click();
  await expect(page).toHaveURL(/\/jobs\//);
  await page.getByRole("tab", { name: "Timeline" }).click();
  await expect(page.getByText("Moved from Saved to Applied.")).toBeVisible();
});

test("keyboard-only pass: digits move the focused card, c closes it, and it can be reopened", async ({
  page,
}, testInfo) => {
  await login(page);

  const company = uniqueName(testInfo, "Northwind Labs");
  const role = "Design Lead";
  const cardName = `${role} at ${company}`;

  await addJob(page, company, role);
  const card = page.getByRole("link", { name: cardName });
  await card.focus();
  await page.keyboard.press("3");
  await expect(page.getByText(`Moved ${role} at ${company} to Recruiter.`)).toBeAttached();

  await card.focus();
  await page.keyboard.press("c");
  const closeDialog = page.getByRole("dialog", { name: "Close this job" });
  await expect(closeDialog).toBeVisible();

  await scanOpenOverlay(page, "close dialog", testInfo, async () => {
    if (!(await closeDialog.isVisible())) {
      await card.focus();
      await page.keyboard.press("c");
    }
    await expect(closeDialog).toBeVisible();
  });

  await closeDialog.getByRole("radio", { name: "Rejected" }).click();
  await closeDialog.getByRole("button", { name: "Close job" }).click();
  await expect(closeDialog).toBeHidden();
  await expect(card).toBeHidden();

  await page.goto("/board?view=closed");
  await expect(page.getByText(cardName)).toBeVisible();
  await scanForViolations(page, "closed list", testInfo);

  // Not getByText(cardName): the live region (lib/board/messages.ts's
  // announce, sr-only but not display:none) keeps showing "Reopened
  // <cardName>." after this click, which also matches that text and would
  // make this assertion unsatisfiable no matter what the closed list does.
  // The row's own Reopen button is unique to it and genuinely gone once the
  // row unmounts.
  await page.getByRole("button", { name: `Reopen ${role} at ${company}` }).click();
  await expect(page.getByRole("button", { name: `Reopen ${role} at ${company}` })).toBeHidden();

  await page.goto("/board");
  await expect(page.getByRole("link", { name: cardName })).toBeVisible();
});
