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
      testMatch: /(shell|pipeline|job-page|documents|bridge|nav|intake)\.spec\.ts$/,
      dependencies: ["first-run"],
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "webkit",
      testMatch: /(shell|pipeline|job-page|documents|bridge|nav|intake)\.spec\.ts$/,
      dependencies: ["first-run"],
      use: { ...devices["Desktop Safari"] },
    },
    {
      name: "phone",
      testMatch: /(shell|pipeline-phone|documents-phone|nav|intake-phone)\.spec\.ts$/,
      dependencies: ["first-run"],
      use: {
        ...devices["iPhone 13"],
        viewport: { width: 390, height: 844 },
      },
    },
  ],
  webServer: {
    // All browsers log in from the same address, so the suite raises the
    // sign-in limit for the server it starts. The default stays 5 per
    // minute. SETUP_TOKEN matches the constant in tests/e2e/account.ts, so
    // first-run.spec.ts can exercise both a missing and a wrong token
    // before using the right one to create the only account. AI_PROVIDER=fake
    // means every intake spec's extraction goes through the
    // deterministic fake driver: no network call, no real AI key needed to
    // run this suite at all.
    command:
      "pnpm build && SETUP_TOKEN=e2e-setup-token-0123456789 AUTH_SIGNIN_MAX_PER_MINUTE=1000 AI_PROVIDER=fake pnpm start",
    url: baseURL,
    // Never reuse a server already listening on baseURL: it would be
    // whatever `pnpm dev` or a stale `pnpm start` happens to have running,
    // built without this suite's SETUP_TOKEN, AUTH_SIGNIN_MAX_PER_MINUTE and
    // AI_PROVIDER, which would then fail in confusing ways rather than at
    // startup.
    reuseExistingServer: false,
    timeout: 180_000,
  },
});
