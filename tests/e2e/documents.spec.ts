import { test, expect, type Page } from "@playwright/test";
import { scanForViolations } from "./axe";
import { scanOpenOverlay } from "./scan-open";
import { scanInPlace } from "./scan-in-place";
import { login, uniqueName, addJobAndOpen } from "./session";

// The trigger's accessible name is its aria-label
// (`Mark version <n> of <title> as sent`), not its visible text ("Mark as
// sent"): aria-label replaces an element's text content in accessible name
// computation rather than supplementing it, so a role query for the plain
// visible words never matches this button - confirmed directly against a
// real page before writing this file. The dialog this trigger opens carries
// no such override (its own title and confirm button read "Mark as sent"
// with no aria-label), so only the trigger itself needs the full name.
function markSentTrigger(page: Page, version: number, title: string) {
  return page.getByRole("button", { name: `Mark version ${version} of ${title} as sent` });
}

test("paste a CV, paste a second version, edit it with Write and Preview, mark it as sent, and edit again for version 3", async ({
  page,
}, testInfo) => {
  // One whole journey with light and dark axe scans of every dialog: about
  // 11s on WebKit locally, and past the default 30s on a shared CI runner.
  test.slow();
  await login(page);
  const company = uniqueName(testInfo, "Lumen Health");
  const role = "Staff Product Designer";
  const slug = await addJobAndOpen(page, company, role);
  const title = uniqueName(testInfo, "CV");

  await page.goto(`/jobs/${slug}?tab=documents`);
  await expect(page.getByText("No documents yet.")).toBeVisible();
  await scanForViolations(page, "empty documents tab", testInfo);

  await test.step("paste a CV", async () => {
    await page.getByRole("button", { name: "Paste markdown" }).click();
    const dialog = page.getByRole("dialog", { name: "Paste markdown" });
    await expect(dialog).toBeVisible();

    await scanOpenOverlay(page, "paste dialog", testInfo, async () => {
      if (!(await dialog.isVisible())) {
        await page.getByRole("button", { name: "Paste markdown" }).click();
      }
      await expect(dialog).toBeVisible();
    });

    const markdown = `# ${title}\n\nLed a design system used by four product teams.`;
    await dialog.getByLabel("Markdown").fill(markdown);
    await dialog.getByRole("button", { name: "Save" }).click();
    await expect(dialog.getByText("Give the document a title.")).toBeVisible();
    await expect(dialog).toBeVisible();
    await expect(dialog.getByLabel("Markdown")).toHaveValue(markdown);

    await dialog.getByLabel("Title").fill(title);
    await dialog.getByRole("button", { name: "Save" }).click();
    await expect(dialog).toBeHidden();
    await expect(page.getByText(`Saved ${title}.`)).toBeAttached();
    await expect(page.getByRole("link", { name: title })).toBeVisible();
  });

  await test.step("an older, never-sent version shows its own banner, not the sent one", async () => {
    const pasteNewVersionButton = page.getByRole("button", { name: `Paste a new version of ${title}` });
    await expect(pasteNewVersionButton).toBeVisible();
    await pasteNewVersionButton.click();
    const dialog = page.getByRole("dialog", { name: "Paste a new version" });
    await expect(dialog).toBeVisible();
    await dialog.getByLabel("Markdown").fill(`# ${title}\n\nA revised pass at the CV, pasted as a second version.`);
    await dialog.getByRole("button", { name: "Save" }).click();
    await expect(dialog).toBeHidden();
    await expect(page.getByText(`Saved ${title} as version 2.`)).toBeAttached();

    await page.getByRole("link", { name: "Version 1" }).click();
    await expect(page).toHaveURL(/&v=1$/);
    await expect(page.getByText("You are viewing version 1. The latest is version 2.")).toBeVisible();
    await expect(page.getByRole("button", { name: `Edit ${title}` })).toBeHidden();
    await expect(markSentTrigger(page, 1, title)).toBeVisible();

    await page.getByRole("link", { name: "Open the latest version" }).click();
    await expect(page).not.toHaveURL(/&v=1$/);
  });

  const article = page.getByRole("article", { name: title });

  await test.step("edit it in Write and Preview, then save", async () => {
    await page.getByRole("button", { name: `Edit ${title}` }).click();
    await scanInPlace(page, "documents editor open", testInfo);

    // exact: true - the Documents tab's own ever-present "Paste markdown"
    // button carries that exact string as its aria-label, which contains
    // "Markdown" as a case-insensitive substring, so an unscoped, non-exact
    // getByLabel("Markdown") matches both it and the editor's real field.
    await page.getByLabel("Markdown", { exact: true }).fill("");
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await expect(page.getByText("The document cannot be empty.")).toBeVisible();
    await expect(page.getByRole("button", { name: "Save", exact: true })).toBeVisible();

    await page.getByLabel("Markdown", { exact: true }).fill(
      `# ${title}\n\nLed a design system used by four product teams.\n\nShipped it across three platforms.`,
    );
    await page.getByRole("button", { name: "Preview" }).click();
    await expect(article.getByText("Shipped it across three platforms.")).toBeVisible();
    await page.getByRole("button", { name: "Write" }).click();

    await page.getByRole("button", { name: "Save", exact: true }).click();
    await expect(page.getByText(`Saved ${title}.`)).toBeAttached();
    await expect(page.getByRole("button", { name: `Edit ${title}` })).toBeFocused();
    await expect(article.getByText("Shipped it across three platforms.")).toBeVisible();
  });

  await test.step("mark it as sent", async () => {
    await markSentTrigger(page, 2, title).click();
    const dialog = page.getByRole("dialog", { name: "Mark as sent" });
    await expect(dialog).toBeVisible();

    await scanOpenOverlay(page, "mark as sent dialog", testInfo, async () => {
      if (!(await dialog.isVisible())) {
        await markSentTrigger(page, 2, title).click();
      }
      await expect(dialog).toBeVisible();
    });

    await dialog.getByRole("button", { name: "Mark as sent" }).click();
    await expect(dialog).toBeHidden();
    await expect(page.getByText(`Marked ${title} as sent.`)).toBeAttached();
    // Not anchored: DocumentView joins its meta parts with " · " inline
    // (joinWithDot), so "Sent <date>" is always preceded by that separator
    // inside the same paragraph - no element's own text ever starts with
    // "Sent " - confirmed directly against the rendered accessibility tree.
    await expect(article.getByText(/Sent /)).toBeVisible();
    await expect(markSentTrigger(page, 2, title)).toBeHidden();
    await expect(page.getByRole("button", { name: `Edit ${title}` })).toBeFocused();
  });

  await test.step("editing the sent latest version again forks version 3", async () => {
    await page.getByRole("button", { name: `Edit ${title}` }).click();
    await expect(page.getByText("Version 2 was sent. Saving creates version 3.")).toBeVisible();
    await page.getByLabel("Markdown", { exact: true }).fill(
      `# ${title}\n\nLed a design system used by four product teams.\n\nNow with a third version.`,
    );
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await expect(page.getByText(`Saved ${title} as version 3.`)).toBeAttached();
    await expect(page.getByRole("link", { name: "Version 3" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Version 2" })).toBeVisible();
    await expect(article.getByText(/Sent /)).toBeHidden(); // the lock stayed on version 2, not the new latest
  });

  await test.step("version 2 opens read-only, with Edit and Mark as sent both gone", async () => {
    await page.getByRole("link", { name: "Version 2" }).click();
    await expect(page).toHaveURL(/&v=2$/);
    await expect(page.getByText("This version was sent and stays read-only.")).toBeVisible();
    await expect(page.getByRole("button", { name: `Edit ${title}` })).toBeHidden();
    await expect(markSentTrigger(page, 2, title)).toBeHidden();
    await page.getByRole("link", { name: "Open the latest version" }).click();
    await expect(page).not.toHaveURL(/&v=2$/);
  });
});

test("switching documents while editing never carries the draft across", async ({ page }, testInfo) => {
  await login(page);
  const company = uniqueName(testInfo, "Solace Dynamics");
  const role = "Product Designer";
  const slug = await addJobAndOpen(page, company, role);
  const titleA = uniqueName(testInfo, "Alpha CV");
  const titleB = uniqueName(testInfo, "Bravo CV");
  const draftMarker = uniqueName(testInfo, "ALPHA-DRAFT-NEVER-SAVED");
  const savedMarker = uniqueName(testInfo, "BRAVO-EDIT-SAVED-FOR-REAL");

  await page.goto(`/jobs/${slug}?tab=documents`);

  async function pasteDocument(title: string, body: string) {
    await page.getByRole("button", { name: "Paste markdown" }).click();
    const dialog = page.getByRole("dialog", { name: "Paste markdown" });
    await expect(dialog).toBeVisible();
    await dialog.getByLabel("Title").fill(title);
    await dialog.getByLabel("Markdown").fill(`# ${title}\n\n${body}`);
    await dialog.getByRole("button", { name: "Save" }).click();
    await expect(dialog).toBeHidden();
    // Server-confirmed announcement before moving on, per the suite's own
    // rule for an optimistic or revalidating action - the paste's own
    // router.push (paste-dialog.tsx) lands the new tab content some time
    // after this same click, not within it.
    await expect(page.getByText(`Saved ${title}.`)).toBeAttached();
  }

  await pasteDocument(titleA, "Original A body.");
  await pasteDocument(titleB, "Original B body.");

  await page.getByRole("link", { name: titleA }).click();
  await expect(page.getByRole("article", { name: titleA })).toBeVisible();
  await page.getByRole("button", { name: `Edit ${titleA}` }).click();
  // exact: true - see the comment on the same pattern above; the ever-present
  // "Paste markdown" button's aria-label contains "Markdown" as a substring.
  await page.getByLabel("Markdown", { exact: true }).fill(`# ${titleA}\n\nOriginal A body.\n\n${draftMarker}`);

  // Select B without saving or cancelling A's edit - this is exactly the
  // regression this test guards against: the editor used to keep reusing
  // the same component instance (and its in-progress draft) across
  // documents, because nothing told React the selected document had
  // changed underneath it.
  await page.getByRole("link", { name: titleB }).click();
  await expect(page.getByRole("article", { name: titleB })).toBeVisible();

  // Selecting B remounts the editor rather than reusing the open instance,
  // so it closes instead of carrying over to B: B renders read-only, with
  // its own Edit button back, not mid-edit with anyone's draft.
  await expect(page.getByLabel("Markdown", { exact: true })).toBeHidden();
  await expect(page.getByRole("button", { name: `Edit ${titleB}` })).toBeVisible();
  await expect(page.getByText(draftMarker)).toHaveCount(0);
  await expect(page.getByRole("article", { name: titleB }).getByText("Original B body.")).toBeVisible();

  await test.step("saving B for real only ever changes B", async () => {
    await page.getByRole("button", { name: `Edit ${titleB}` }).click();
    await page.getByLabel("Markdown", { exact: true }).fill(`# ${titleB}\n\nOriginal B body.\n\n${savedMarker}`);
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await expect(page.getByText(`Saved ${titleB}.`)).toBeAttached();
    await expect(page.getByRole("article", { name: titleB }).getByText(savedMarker)).toBeVisible();
  });

  await test.step("A was never touched by any of the above", async () => {
    await page.getByRole("link", { name: titleA }).click();
    await expect(page.getByRole("article", { name: titleA })).toBeVisible();
    await expect(page.getByRole("article", { name: titleA }).getByText("Original A body.")).toBeVisible();
    await expect(page.getByText(draftMarker)).toHaveCount(0);
    await expect(page.getByText(savedMarker)).toHaveCount(0);
  });
});
