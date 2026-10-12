import { test, expect } from "@playwright/test";
import { scanOpenOverlay } from "./scan-open";
import { addJobOnBoard, login, uniqueName } from "./session";

test("a move offers the next action, the toast opens the dialog, and n opens it from the card", async ({
  page,
}, testInfo) => {
  test.slow();
  await login(page);
  const company = uniqueName(testInfo, "Northwind Traders");
  const role = "Product Designer";
  const cardName = `${role} at ${company}`;
  await addJobOnBoard(page, company, role);

  const card = page.getByRole("link", { name: cardName });
  // The card's own box: the same text sits on the other projects' cards and
  // in the phone list that the desktop layout hides.
  const cardBox = page
    .getByRole("region", { name: "Board columns" })
    .locator("div.rounded-lg.border")
    .filter({ has: card });
  await card.focus();
  await page.keyboard.press("2");
  await expect(page.getByText(`Moved ${role} at ${company} to Applied.`)).toBeAttached();
  await expect(card).toBeFocused();

  const offer = page.getByText(`What is next for ${role} at ${company}?`);
  await expect(offer).toBeVisible();
  await page.getByRole("button", { name: "Set next action" }).click();

  const dialog = page.getByRole("dialog", { name: "Set the next action" });
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText(cardName);
  await expect(dialog.getByLabel("What is next")).toBeFocused();

  await dialog.getByLabel("What is next").fill("Send the portfolio link");
  await dialog.getByRole("button", { name: "Save" }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByText(`Next action saved for ${role} at ${company}.`)).toBeAttached();
  await expect(card).toBeFocused();
  await expect(cardBox.getByText("Next: Send the portfolio link")).toBeVisible();

  // n opens the same dialog without a move, seeded with what is saved.
  await page.keyboard.press("n");
  await expect(dialog).toBeVisible();
  await expect(dialog.getByLabel("What is next")).toHaveValue("Send the portfolio link");

  await scanOpenOverlay(page, "set the next action dialog", testInfo, async () => {
    if (!(await dialog.isVisible())) {
      await card.focus();
      await page.keyboard.press("n");
    }
    await expect(dialog).toBeVisible();
  });

  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(card).toBeFocused();
});
