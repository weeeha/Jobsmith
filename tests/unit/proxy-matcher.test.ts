import { describe, it, expect } from "vitest";
import { AsyncLocalStorage } from "node:async_hooks";

describe("proxy matcher", () => {
  it("excludes every /api/bridge/* path, while still matching pages, /api/auth/* and a near-miss path", async () => {
    // Next's server-testing helpers expect the AsyncLocalStorage global its
    // own runtime installs; Vitest's plain Node environment does not
    // provide it automatically.
    (globalThis as { AsyncLocalStorage?: unknown }).AsyncLocalStorage ??= AsyncLocalStorage;
    const { unstable_doesMiddlewareMatch } = await import("next/experimental/testing/server");
    const { config } = await import("@/proxy");
    const matches = (url: string) => unstable_doesMiddlewareMatch({ config, url });

    expect(matches("/api/bridge/opportunities")).toBe(false);
    expect(matches("/api/bridge/opportunities/acme-designer/artifacts")).toBe(false);
    expect(matches("/api/bridge/opportunities/acme-designer/context")).toBe(false);
    // A near-miss path that merely starts with the same characters must
    // still run the proxy: the exclusion is "api/bridge/" as a path
    // segment, not a bare string prefix match on "api/bridge".
    expect(matches("/api/bridgework")).toBe(true);
    expect(matches("/api/auth/sign-in/email")).toBe(true);
    expect(matches("/board")).toBe(true);
    expect(matches("/jobs/acme-designer")).toBe(true);
    expect(matches("/settings")).toBe(true);
    expect(matches("/")).toBe(true);
    expect(matches("/_next/static/chunk.js")).toBe(false);
  });
});
