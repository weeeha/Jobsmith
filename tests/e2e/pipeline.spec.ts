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
// "<column>, no jobs"), so one query locates the drop target either way.
//
// Every position used here is measured as late as possible, right before
// it is acted on, rather than cached once up front: this board is shared
// with whatever other browser projects (or, under --repeat-each, other
// runs of this same test) are doing at the same time, cards sort by
// most-recently-updated first (lib/board/sort.ts), and a card or column
// this test already measured can be reflowed to a new position by any of
// those the instant a concurrently running one of its own actions touches
// the same account - confirmed by instrumenting a failing run, where
// document.elementFromPoint at the cached start coordinate resolved to
// nothing at all, because a sibling run's own update had already moved
// the card out from under it. hover() re-measures and waits for the
// source card to be stable immediately before the pointer moves there;
// the column is measured once to aim the intermediate moves dnd-kit needs
// and again right before release, in case it also shifted meanwhile. The
// drop targets a point near the column's own top edge rather than its
// center for a second reason: the column can hold more cards than fit in
// one viewport under the same heavy/concurrent use, and a point near the
// top stays reachable regardless of how tall the full column has grown.
async function dragCardToColumn(page: Page, cardName: string, columnName: string) {
  const card = page.getByRole("link", { name: cardName });
  const column = page.getByRole("region", { name: new RegExp("^" + columnName + ",") });

  await card.hover();
  const cardBox = await card.boundingBox();
  if (!cardBox) {
    throw new Error(`dragCardToColumn: could not locate "${cardName}"`);
  }
  const start = { x: cardBox.x + cardBox.width / 2, y: cardBox.y + cardBox.height / 2 };

  await page.mouse.move(start.x, start.y);
  await page.mouse.down();

  function topOf(box: { x: number; y: number; width: number; height: number }) {
    return { x: box.x + box.width / 2, y: box.y + Math.min(40, box.height / 2) };
  }

  const firstColumnBox = await column.boundingBox();
  if (!firstColumnBox) {
    throw new Error(`dragCardToColumn: could not locate column "${columnName}"`);
  }
  const end = topOf(firstColumnBox);
  const steps = 12;
  for (let i = 1; i <= steps; i++) {
    await page.mouse.move(start.x + ((end.x - start.x) * i) / steps, start.y + ((end.y - start.y) * i) / steps);
  }

  const lastColumnBox = await column.boundingBox();
  if (lastColumnBox) {
    const finalEnd = topOf(lastColumnBox);
    await page.mouse.move(finalEnd.x, finalEnd.y);
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
  // The card above disappears as soon as the board's own optimistic update
  // applies, before closeAction's server round trip has actually resolved
  // (board.tsx's runClose dispatches the removal first and announces only
  // once the action comes back ok), so the check above can pass while the
  // close has not yet been committed. Navigating to the closed list right
  // after that, the way the earlier "Moved ... to Recruiter." wait already
  // does for the move above, waiting for the announcement here is what
  // makes sure the closed list below is being asked to show a job the
  // server has actually closed, not one this page has merely stopped
  // showing on its own.
  await expect(page.getByText(`Closed ${role} at ${company}.`)).toBeAttached();

  await page.goto("/board?view=closed");
  await expect(page.getByText(cardName)).toBeVisible();
  await scanForViolations(page, "closed list", testInfo);

  // Not getByText(cardName): the live region (lib/board/messages.ts's
  // announce, sr-only but not display:none) keeps showing "Reopened
  // <cardName>." after this click, which also matches that text and would
  // make this assertion unsatisfiable no matter what the closed list does.
  // The row's own Reopen button is unique to it and genuinely gone once the
  // row unmounts. Unlike the close above, this row has no optimistic step
  // of its own (ClosedListRow calls reopenAction and only announces on
  // success; the row stays until the server response actually lands and
  // this page re-renders with it), so the button's own disappearance below
  // already cannot happen before the server has committed the reopen, and
  // needs no separate announcement wait before the navigation that follows.
  await page.getByRole("button", { name: `Reopen ${role} at ${company}` }).click();
  await expect(page.getByRole("button", { name: `Reopen ${role} at ${company}` })).toBeHidden();

  await page.goto("/board");
  await expect(page.getByRole("link", { name: cardName })).toBeVisible();
});
