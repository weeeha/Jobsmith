import { test, expect } from "@playwright/test";

// /api/health is the one route a container healthcheck and an uptime monitor
// reach with no session, so this spec sends the request with no cookies at all.
test("health: answers 200 with status ok, no cookie and no redirect to login", async ({ playwright, baseURL }) => {
  const anonymous = await playwright.request.newContext({ baseURL, storageState: { cookies: [], origins: [] } });
  try {
    const response = await anonymous.get("/api/health", { maxRedirects: 0 });
    expect(response.status()).toBe(200);
    expect(response.headers()["set-cookie"]).toBeUndefined();
    const body = await response.json();
    expect(body.status).toBe("ok");
    expect(body.checks).toEqual({ database: "ok", schema: "current" });
  } finally {
    await anonymous.dispose();
  }
});
