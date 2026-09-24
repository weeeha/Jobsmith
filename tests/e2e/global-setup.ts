async function globalSetup() {
  process.env.ALLOW_DB_RESET = "true";
  const { execSync } = await import("node:child_process");
  execSync("pnpm reset-db", { stdio: "inherit" });
}

export default globalSetup;
