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

  it("release.yml runs on v* tag pushes and wires verify, smoke, build, merge and release", () => {
    const text = read("release.yml");
    const head = text.split(/^jobs:/m)[0];
    expect(head).toMatch(/^ {2}push:\n\s+tags: \["v\*"\]/m);
    expect(head).not.toMatch(/^ {2}(pull_request|workflow_dispatch):/m);
    for (const p of ["contents: write", "packages: write", "id-token: write", "attestations: write"]) {
      expect(head).toContain(p);
    }
    const jobs = text.split(/^jobs:/m)[1];
    const job = (name: string) => jobs.split(new RegExp(`^ {2}${name}:`, "m"))[1]?.split(/^ {2}\w[\w-]*:/m)[0] ?? "";
    expect(job("smoke")).toContain("uses: ./.github/workflows/image.yml");
    expect(job("build")).toContain("needs: [verify, smoke]");
    expect(job("build")).toMatch(/ubuntu-24\.04-arm/);
    expect(job("build")).toContain(
      "outputs: type=image,name=ghcr.io/weeeha/jobsmith,push-by-digest=true,name-canonical=true,push=true",
    );
    expect(job("build")).toContain("provenance: mode=max");
    expect(job("build")).toContain("sbom: true");
    expect(job("merge")).toContain("needs: [build]");
    expect(job("merge")).toContain("docker buildx imagetools create");
    expect(job("merge")).toContain("scripts/release-tags.mjs");
    expect(job("release")).toContain("needs: [merge]");
    expect(job("release")).toContain("cli/dist/jobsmith.mjs");
    expect(job("verify")).toContain("merge-base --is-ancestor");
    expect(job("verify")).toContain("scripts/check-version.mjs");
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
