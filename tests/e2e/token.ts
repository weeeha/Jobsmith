import { expect, type Page, type TestInfo } from "@playwright/test";
import { scanForViolations } from "./axe";

export async function createToken(page: Page, name: string, testInfo: TestInfo): Promise<string> {
  await page.goto("/settings");
  // The rest of this file only scans dialogs opened from Settings, so the
  // plain page itself needs its own scan here, before anything is open.
  await scanForViolations(page, "settings", testInfo);
  await page.getByRole("button", { name: "Create token" }).click();
  const dialog = page.getByRole("dialog", { name: "Create a token" });
  await expect(dialog).toBeVisible();

  await dialog.getByRole("button", { name: "Create token" }).click();
  await expect(dialog.getByText("Give the token a name.")).toBeVisible();
  await expect(dialog).toBeVisible();

  await dialog.getByLabel("Name").fill(name);
  await dialog.getByRole("button", { name: "Create token" }).click();
  const revealDialog = page.getByRole("dialog", { name: "Copy your new token" });
  await expect(revealDialog).toBeVisible();
  // Scoped to the dialog, not page.getByLabel: the dialog's own title,
  // "Copy your new token", contains "your new token" as a case-insensitive
  // substring, so an unscoped query for that label matches both the real
  // input and the dialog's own labelled root - confirmed directly against a
  // real run before adding this scope.
  await expect(revealDialog.getByLabel("Your new token")).toBeFocused();
  const token = await revealDialog.getByLabel("Your new token").inputValue();
  await page.getByRole("button", { name: "Done" }).click();
  return token;
}
