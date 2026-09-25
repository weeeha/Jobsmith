import fs from "node:fs";
import path from "node:path";
import { test, expect, type Page, type TestInfo } from "@playwright/test";
import { scanForViolations } from "./axe";
import { scanOpenOverlay } from "./scan-open";
import { login, uniqueName, addJobAndOpen } from "./session";
import { runCli } from "./cli";

async function createToken(page: Page, name: string, testInfo: TestInfo): Promise<string> {
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

test("the CLI pushes a real packet, a second push changes nothing, the app reads it back, and a revoked token is refused", async ({
  page,
}, testInfo) => {
  // One whole journey with CLI runs and light and dark axe scans: about 14s
  // on WebKit locally, and past the default 30s on a shared CI runner.
  test.slow();
  await login(page);
  const company = uniqueName(testInfo, "Northwind Labs");
  const role = "Design Lead";
  const slug = await addJobAndOpen(page, company, role);
  const origin = new URL(page.url()).origin;
  const tokenName = uniqueName(testInfo, "CLI");

  const token = await test.step("create a token in Settings", () => createToken(page, tokenName, testInfo));

  const configHome = testInfo.outputPath("cli-config");

  await test.step("jobsmith login saves the URL and token", async () => {
    const result = await runCli(["login", "--url", origin], { configHome, input: `${token}\n` });
    expect(result.code).toBe(0);
    expect(result.stdout).toContain(`Logged in to ${origin}.`);
  });

  await test.step("the first push creates every document, with the debrief's one stage warning", async () => {
    const result = await runCli(["push", slug, "--dir", "tests/fixtures/packet", "--prefix", "nwl"], { configHome });
    expect(result.code).toBe(0);
    expect(result.stdout).toContain("11 created, 0 versioned, 0 updated, 0 unchanged.");
    expect(result.stdout).toContain("Warning:");
  });

  await test.step("a second, identical push reports every document unchanged", async () => {
    const result = await runCli(["push", slug, "--dir", "tests/fixtures/packet", "--prefix", "nwl"], { configHome });
    expect(result.code).toBe(0);
    expect(result.stdout).toContain("0 created, 0 versioned, 0 updated, 11 unchanged.");
  });

  await test.step("pull writes the context document for this job", async () => {
    const outDir = testInfo.outputPath("pull-out");
    const result = await runCli(["pull", slug, "--out", outDir], { configHome });
    expect(result.code).toBe(0);
    const written = path.join(outDir, `${slug}-context.md`);
    expect(result.stdout).toContain(`Wrote ${written}.`);
    const content = fs.readFileSync(written, "utf8");
    expect(content).toContain("jobsmith: context/v1");
    expect(content).toContain(company);
  });

  await test.step("exactly one Documents updated. event despite two pushes", async () => {
    await page.goto(`/jobs/${slug}?tab=timeline`);
    await expect(page.getByText("Documents updated.")).toHaveCount(1);
  });

  await test.step("Research, Documents and Prep show the pushed documents, with axe on each", async () => {
    await page.goto(`/jobs/${slug}?tab=research`);
    await expect(page.getByRole("link", { name: "Northwind Labs: fit brief" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Northwind Labs: people in the loop" })).toBeVisible();
    await expect(page.getByRole("heading", { name: `Shared with every job at ${company}` })).toBeVisible();
    await expect(page.getByRole("link", { name: "Northwind Labs: company recon" })).toBeVisible();
    // Opens the shared recon document itself, not just its link, so this
    // proves the pushed body actually renders rather than merely landing a
    // row with the right title.
    await page.getByRole("link", { name: "Northwind Labs: company recon" }).click();
    await expect(page.getByText("Northwind Labs sells scheduling software to clinics.")).toBeVisible();
    await scanForViolations(page, "research tab with documents", testInfo);

    await page.goto(`/jobs/${slug}?tab=documents`);
    await expect(page.getByRole("link", { name: "CV for Northwind Labs" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Cover letter for Northwind Labs" })).toBeVisible();
    await page.getByRole("link", { name: "CV for Northwind Labs" }).click();
    await expect(page.getByText("Led a design system used by four product teams.")).toBeVisible();
    await scanForViolations(page, "documents tab with documents", testInfo);

    await page.goto(`/jobs/${slug}?tab=prep`);
    await expect(page.getByRole("heading", { name: "Recruiter screen" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Hiring manager" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Northwind Labs: full answers" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Northwind Labs: recruiter screen questions" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Northwind Labs: hiring manager call card" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Portfolio walkthrough pitch" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Northwind Labs: round two debrief" })).toBeVisible();
    await page.getByRole("link", { name: "Northwind Labs: hiring manager call card" }).click();
    await expect(page.getByText("Open with the onboarding redesign story.")).toBeVisible();
    // The pitch carries its own title and stage in frontmatter rather than
    // the usual derived-from-filename kind, so opening it proves that path
    // too, alongside the body itself landing under Prep.
    await page.getByRole("link", { name: "Portfolio walkthrough pitch" }).click();
    await expect(page.getByText("One sentence framing of the case study.")).toBeVisible();
    await scanForViolations(page, "prep tab with documents", testInfo);
  });

  await test.step("axe on the create-token reveal state and the revoke dialog, using a disposable second token", async () => {
    await page.goto("/settings");
    const scratchName = uniqueName(testInfo, "Axe scratch token");
    await page.getByRole("button", { name: "Create token" }).click();
    const createDialog = page.getByRole("dialog", { name: "Create a token" });
    await createDialog.getByLabel("Name").fill(scratchName);
    await createDialog.getByRole("button", { name: "Create token" }).click();
    const revealDialog = page.getByRole("dialog", { name: "Copy your new token" });
    await expect(revealDialog).toBeVisible();
    await scanOpenOverlay(page, "create token reveal state", testInfo, async () => {
      await expect(revealDialog).toBeVisible();
    });
    await page.getByRole("button", { name: "Done" }).click();

    await page.getByRole("button", { name: `Revoke ${scratchName}` }).click();
    const revokeDialog = page.getByRole("dialog", { name: "Revoke this token" });
    await expect(revokeDialog).toBeVisible();
    await scanOpenOverlay(page, "revoke token dialog", testInfo, async () => {
      if (!(await revokeDialog.isVisible())) {
        await page.getByRole("button", { name: `Revoke ${scratchName}` }).click();
      }
      await expect(revokeDialog).toBeVisible();
    });
    await revokeDialog.getByRole("button", { name: "Revoke token" }).click();
    await expect(revokeDialog).toBeHidden();
  });

  await test.step("revoking the CLI's own token makes list exit 1 with the refused-token line", async () => {
    await page.goto("/settings");
    await page.getByRole("button", { name: `Revoke ${tokenName}` }).click();
    const dialog = page.getByRole("dialog", { name: "Revoke this token" });
    await expect(dialog).toBeVisible();
    await dialog.getByRole("button", { name: "Revoke token" }).click();
    await expect(dialog).toBeHidden();

    const result = await runCli(["list"], { configHome });
    expect(result.code).toBe(1);
    expect(result.stderr).toContain(
      "The server refused the token. Create a new one in Settings and run jobsmith login.",
    );
  });
});
