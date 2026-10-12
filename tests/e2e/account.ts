export const EMAIL = "e2e-owner@example.com";
export const PASSWORD = "correct horse battery staple";

// Must match the SETUP_TOKEN the webServer command in playwright.config.ts
// starts the server with.
export const SETUP_TOKEN = "e2e-setup-token-0123456789";

// The shared account's profile text. The three browser projects use one
// account at the same time, so every spec that saves the profile form saves
// these same two values: a spec that saved a blank headline would wipe the one
// another spec is about to read back.
export const E2E_HEADLINE = "Product designer, design systems";
export const E2E_RESUME = "Product designer with eight years in internal tools and design systems.";
