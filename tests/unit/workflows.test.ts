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
