import { describe, it, expect } from "vitest";
import nextConfig from "@/next.config";

type HeaderRule = { source: string; headers: { key: string; value: string }[] };
async function rules(): Promise<HeaderRule[]> {
  return (await nextConfig.headers!()) as HeaderRule[];
}
const value = (rule: HeaderRule | undefined, key: string) => rule?.headers.find((h) => h.key === key)?.value;

describe("next.config", () => {
  it("/sw.js has Cache-Control no-cache and the content-security headers from the Next.js guide", async () => {
    const sw = (await rules()).find((r) => r.source === "/sw.js");
    expect(value(sw, "Cache-Control")).toContain("no-cache");
    expect(value(sw, "Content-Type")).toBe("application/javascript; charset=utf-8");
    expect(value(sw, "Content-Security-Policy")).toContain("default-src 'self'; script-src 'self'");
  });

  it("the /:path* rule still sets frame-ancestors 'none', and so does the /sw.js one that overrides its policy", async () => {
    const all = await rules();
    expect(value(all.find((r) => r.source === "/:path*"), "Content-Security-Policy")).toBe("frame-ancestors 'none'");
    expect(value(all.find((r) => r.source === "/sw.js"), "Content-Security-Policy")).toContain("frame-ancestors 'none'");
    // /sw.js comes after /:path*, so its values win for the same key.
    expect(all.findIndex((r) => r.source === "/sw.js")).toBeGreaterThan(all.findIndex((r) => r.source === "/:path*"));
  });

  it("generateBuildId and NEXT_PUBLIC_BUILD_ID give the same value", async () => {
    const id = await nextConfig.generateBuildId!();
    expect(id).toBeTruthy();
    expect(nextConfig.env?.NEXT_PUBLIC_BUILD_ID).toBe(id);
    expect(await nextConfig.generateBuildId!()).toBe(id);
  });
});
