import { defineConfig, devices } from "@playwright/test";

const baseURL = process.env.APP_URL ?? "http://localhost:3000";

export default defineConfig({
  testDir: "./tests/e2e",
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: "html",
  globalSetup: "./tests/e2e/global-setup.ts",
  use: {
    baseURL,
    trace: "on-first-retry",
  },
  projects: [
    {
      // Runs once, on the freshly reset database, and creates the only account.
      // No retries: a second attempt would find the account already there.
      name: "first-run",
      testMatch: /first-run\.spec\.ts/,
      retries: 0,
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "chromium",
      testMatch: /shell\.spec\.ts/,
      dependencies: ["first-run"],
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "webkit",
      testMatch: /shell\.spec\.ts/,
      dependencies: ["first-run"],
      use: { ...devices["Desktop Safari"] },
    },
    {
      name: "phone",
      testMatch: /shell\.spec\.ts/,
      dependencies: ["first-run"],
      use: {
        ...devices["iPhone 13"],
        viewport: { width: 390, height: 844 },
      },
    },
  ],
  webServer: {
    // All browsers log in from the same address, so the suite raises the
    // sign-in limit for the server it starts. The default stays 5 per minute.
    command: "pnpm build && AUTH_SIGNIN_MAX_PER_MINUTE=1000 pnpm start",
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
});
