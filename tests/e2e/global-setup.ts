async function globalSetup() {
  process.env.ALLOW_DB_RESET = "true";
  const { execSync } = await import("node:child_process");
  // The clips of the last run belong to the database reset-db is about to
  // drop, so they go too. playwright.config.ts points the server at this folder.
  const { rm } = await import("node:fs/promises");
  await rm(".data/e2e-storage", { recursive: true, force: true });
  execSync("pnpm reset-db", { stdio: "inherit" });
  execSync("pnpm cli:build", { stdio: "inherit" });
}

export default globalSetup;
