import { describe, it, expect, vi } from "vitest";
import { registerServiceWorker } from "@/lib/offline/register";

function fakeContainer(impl?: () => Promise<unknown>) {
  const register = vi.fn(impl ?? (async () => ({ scope: "/" })));
  return { container: { register } as unknown as ServiceWorkerContainer, register };
}

describe("registerServiceWorker", () => {
  it("registers /sw.js?build=<id> with scope /", async () => {
    const { container, register } = fakeContainer();
    const result = await registerServiceWorker("abc123", { serviceWorker: container, env: "production" });
    expect(result).toEqual({ scope: "/" });
    expect(register).toHaveBeenCalledWith("/sw.js?build=abc123", { scope: "/" });
  });

  it("returns null when serviceWorker is unsupported or in development, and does not register", async () => {
    const { container, register } = fakeContainer();
    expect(await registerServiceWorker("b", { serviceWorker: container, env: "development" })).toBeNull();
    expect(await registerServiceWorker("b", { serviceWorker: container, env: "test" })).toBeNull();
    expect(register).not.toHaveBeenCalled();
    expect(await registerServiceWorker("b", { env: "production" })).toBeNull();
  });

  it("returns null and logs when registration fails", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const { container } = fakeContainer(async () => {
      throw new Error("blocked");
    });
    expect(await registerServiceWorker("b", { serviceWorker: container, env: "production" })).toBeNull();
    expect(error).toHaveBeenCalled();
    error.mockRestore();
  });

  it("url-encodes the build id", async () => {
    const { container, register } = fakeContainer();
    await registerServiceWorker("a b&c", { serviceWorker: container, env: "production" });
    expect(register).toHaveBeenCalledWith("/sw.js?build=a%20b%26c", { scope: "/" });
  });
});
