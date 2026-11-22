import { readFileSync } from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

async function loadConfig(standalone: string | undefined) {
  vi.resetModules();
  if (standalone === undefined) vi.stubEnv("JOBSMITH_STANDALONE", undefined as never);
  else vi.stubEnv("JOBSMITH_STANDALONE", standalone);
  return (await import("../../next.config")).default;
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("next.config", () => {
  it("sets output standalone only when JOBSMITH_STANDALONE is 1", async () => {
    expect((await loadConfig("1")).output).toBe("standalone");
    expect((await loadConfig(undefined)).output).toBeUndefined();
    expect((await loadConfig("0")).output).toBeUndefined();
    expect((await loadConfig("true")).output).toBeUndefined();
  });

  it("leaves output unset by default so the owner's Vercel build is unchanged", async () => {
    const config = await loadConfig(undefined);
    expect("output" in config).toBe(false);
  });

  it("declares the runtime-read files in outputFileTracingIncludes", async () => {
    const config = await loadConfig(undefined);
    expect(config.outputFileTracingIncludes).toEqual({
      "/*": [
        "./content/legal/**",
        "./lib/auth/disposable-domains.txt",
        "./lib/doc-export/fonts/**",
      ],
    });
  });

  it("keeps serverExternalPackages and the action body limit", async () => {
    const config = await loadConfig("1");
    expect(config.serverExternalPackages).toEqual([
      "linkedom",
      "turndown",
      "@mozilla/readability",
    ]);
    expect(config.experimental?.serverActions?.bodySizeLimit).toBe("2mb");
  });

  it("vercel.ts does not set JOBSMITH_STANDALONE", () => {
    const text = readFileSync(path.join(process.cwd(), "vercel.ts"), "utf8");
    expect(text).not.toContain("JOBSMITH_STANDALONE");
  });
});
