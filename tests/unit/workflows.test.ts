import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const dir = path.join(process.cwd(), ".github/workflows");
const files = readdirSync(dir).filter((f) => /\.ya?ml$/.test(f));
const read = (f: string) => readFileSync(path.join(dir, f), "utf8");

describe("workflows", () => {
  // The plan asks for 40-character commit SHAs. ci.yml uses version tags and
  // the owner has not chosen to change it yet, so this checks the weaker rule
  // (an explicit version, never a branch or no ref) and counts SHA pins.
  it("every uses: line in .github/workflows names an explicit version or commit SHA", () => {
    const bad: string[] = [];
    for (const f of files) {
      for (const line of read(f).split("\n")) {
        const m = line.match(/^\s*(?:-\s*)?uses:\s*(\S+)/);
        if (!m || m[1].startsWith("./")) continue;
        const ref = m[1].split("@")[1] ?? "";
        if (!/^(v\d+(\.\d+){0,2}|[0-9a-f]{40})$/.test(ref)) bad.push(`${f}: ${m[1]}`);
      }
    }
    expect(bad).toEqual([]);
  });

  it("image.yml triggers on pull_request, push to main and workflow_call", () => {
    const head = read("image.yml").split(/^jobs:/m)[0];
    expect(head).toMatch(/^ {2}pull_request:/m);
    expect(head).toMatch(/^ {2}push:\n\s+branches: \[main\]/m);
    expect(head).toMatch(/^ {2}workflow_call:/m);
  });
});

describe("playwright.config.ts", () => {
  const load = async (external: string | undefined) => {
    const { vi } = await import("vitest");
    vi.resetModules();
    if (external === undefined) delete process.env.E2E_EXTERNAL_SERVER;
    else process.env.E2E_EXTERNAL_SERVER = external;
    return (await import("../../playwright.config")).default;
  };
  it("keeps webServer by default and omits it when E2E_EXTERNAL_SERVER=1", async () => {
    const saved = process.env.E2E_EXTERNAL_SERVER;
    try {
      const normal = await load(undefined);
      expect(normal.webServer).toBeTruthy();
      expect((normal.webServer as { reuseExistingServer: boolean }).reuseExistingServer).toBe(false);
      expect((await load("1")).webServer).toBeUndefined();
    } finally {
      if (saved === undefined) delete process.env.E2E_EXTERNAL_SERVER;
      else process.env.E2E_EXTERNAL_SERVER = saved;
    }
  });
});
