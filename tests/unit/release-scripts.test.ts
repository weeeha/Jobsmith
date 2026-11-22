import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { changelogSection } from "../../scripts/changelog-section.mjs";
import { checkVersion } from "../../scripts/check-version.mjs";
import { releaseTags } from "../../scripts/release-tags.mjs";

describe("releaseTags", () => {
  it("v1.2.3 with nothing newer gets 1.2.3, 1.2, 1 and latest", () => {
    expect(releaseTags("v1.2.3", [])).toEqual(["1.2.3", "1.2", "1", "latest"]);
    expect(releaseTags("v1.2.3", ["v1.2.3", "v1.2.2", "v1.1.9", "v0.9.0", "v2.0.0-rc.1"])).toEqual([
      "1.2.3",
      "1.2",
      "1",
      "latest",
    ]);
  });
  it("v1.2.3 when 1.2.4 exists gets only 1.2.3", () => {
    expect(releaseTags("v1.2.3", ["v1.2.4"])).toEqual(["1.2.3"]);
  });
  it("v1.2.3 when 1.3.0 exists gets 1.2.3 and 1.2 but not 1 or latest", () => {
    expect(releaseTags("v1.2.3", ["v1.3.0"])).toEqual(["1.2.3", "1.2"]);
  });
  it("v1.2.3 when 2.0.0 exists gets 1.2.3, 1.2 and 1 but not latest", () => {
    expect(releaseTags("v1.2.3", ["v2.0.0"])).toEqual(["1.2.3", "1.2", "1"]);
  });
  it("v0.9.0-rc.1 gets only 0.9.0-rc.1, never latest", () => {
    expect(releaseTags("v0.9.0-rc.1", [])).toEqual(["0.9.0-rc.1"]);
    expect(releaseTags("v0.9.0-rc.1", ["v0.8.0"])).toEqual(["0.9.0-rc.1"]);
  });
  it("a prerelease never blocks a stable floating tag", () => {
    expect(releaseTags("v0.9.0", ["v0.9.1-rc.1"])).toEqual(["0.9.0", "0.9", "0", "latest"]);
  });
  it("rejects a tag that is not a release version", () => {
    expect(() => releaseTags("nightly", [])).toThrow();
  });
});

describe("changelogSection", () => {
  const md = [
    "# Changelog",
    "",
    "## [Unreleased]",
    "- later",
    "",
    "## [1.0.0]",
    "- first",
    "- second",
    "",
    "## [0.9.0]",
    "- older",
    "",
  ].join("\n");
  it("returns the body of '## [1.0.0]' up to the next '## ['", () => {
    expect(changelogSection(md, "1.0.0")).toBe("- first\n- second");
  });
  it("runs to the end of the file for the last section", () => {
    expect(changelogSection(md, "0.9.0")).toBe("- older");
  });
  it("returns an empty string for a version with no section", () => {
    expect(changelogSection(md, "2.0.0")).toBe("");
  });
});

describe("checkVersion", () => {
  const good = {
    packageJson: JSON.stringify({ version: "1.2.3" }),
    cliPackageJson: JSON.stringify({ version: "1.2.3" }),
    cliVersionTs: 'export const CLI_VERSION = "1.2.3";\n',
  };
  it("returns no problems when all three files match the tag", () => {
    expect(checkVersion("v1.2.3", good)).toEqual([]);
  });
  it("names each file that differs from the tag", () => {
    const problems = checkVersion("v1.2.3", {
      packageJson: JSON.stringify({ version: "1.2.2" }),
      cliPackageJson: good.cliPackageJson,
      cliVersionTs: 'export const CLI_VERSION = "1.0.0";\n',
    });
    expect(problems).toHaveLength(2);
    expect(problems[0]).toContain("package.json");
    expect(problems[1]).toContain("cli/src/version.ts");
    expect(problems.join("\n")).not.toContain("cli/package.json");
  });
  it("reports a file it cannot read a version from", () => {
    expect(checkVersion("v1.2.3", { ...good, cliVersionTs: "" })).toEqual([
      expect.stringContaining("cli/src/version.ts"),
    ]);
  });
});

describe("changelog-section script", () => {
  it("prints 'No changelog yet.' when the file does not exist", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "chlog-"));
    try {
      const r = spawnSync("node", ["scripts/changelog-section.mjs", "v1.0.0", path.join(dir, "CHANGELOG.md")], {
        encoding: "utf8",
      });
      expect(r.status).toBe(0);
      expect(r.stdout.trim()).toBe("No changelog yet.");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
  it("fails when the file exists but has no section for the version", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "chlog-"));
    try {
      const f = path.join(dir, "CHANGELOG.md");
      writeFileSync(f, "# Changelog\n\n## [0.1.0]\n- x\n");
      const r = spawnSync("node", ["scripts/changelog-section.mjs", "v1.0.0", f], { encoding: "utf8" });
      expect(r.status).toBe(1);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("check-version script", () => {
  it("fails against a tag that differs from the repo files", () => {
    const r = spawnSync("node", ["scripts/check-version.mjs", "v9.9.9"], { encoding: "utf8" });
    expect(r.status).toBe(1);
    expect(r.stderr).toContain("package.json");
  });
});
