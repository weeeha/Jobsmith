import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { collectLicenses, writeLicenses } from "../../scripts/licenses-collect.mjs";

let work: string;

beforeEach(() => {
  work = mkdtempSync(path.join(os.tmpdir(), "licenses-"));
});
afterEach(() => rmSync(work, { recursive: true, force: true }));

function pkg(name: string, version: string, license: string, file: string | null, text = "") {
  const dir = path.join(work, name.replace("/", "__"));
  mkdirSync(dir, { recursive: true });
  if (file) writeFileSync(path.join(dir, file), text);
  return { name, versions: [version], paths: [dir], license };
}

describe("licenses-collect", () => {
  it("writes each package's name, version, license and text", () => {
    const report = {
      MIT: [pkg("alpha", "1.2.3", "MIT", "LICENSE", "Alpha license text")],
      "Apache-2.0": [pkg("@scope/beta", "4.5.6", "Apache-2.0", "LICENSE.md", "Beta license text")],
    };
    const out = path.join(work, "THIRD_PARTY_LICENSES.txt");
    writeLicenses(report, out);
    const text = readFileSync(out, "utf8");
    expect(text).toContain("alpha 1.2.3");
    expect(text).toContain("License: MIT");
    expect(text).toContain("Alpha license text");
    expect(text).toContain("@scope/beta 4.5.6");
    expect(text).toContain("License: Apache-2.0");
    expect(text).toContain("Beta license text");
  });

  it("fails with the package name when a license file cannot be read", () => {
    const report = { MIT: [pkg("gamma", "0.0.1", "MIT", null)] };
    expect(() => collectLicenses(report)).toThrow(/gamma/);
  });
});
