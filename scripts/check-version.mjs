#!/usr/bin/env node
// Fails when package.json, cli/package.json or cli/src/version.ts differ from
// the release tag. Run by .github/workflows/release.yml.
//   check-version <vX.Y.Z[-rc.N]>
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

/**
 * @param {string} tag
 * @param {{ packageJson: string, cliPackageJson: string, cliVersionTs: string }} files  file contents
 * @returns {string[]} one problem per file that differs from the tag
 */
export function checkVersion(tag, files) {
  const want = tag.replace(/^v/, "");
  const problems = [];
  const versionOf = (name, read) => {
    let got;
    try {
      got = read();
    } catch {
      got = undefined;
    }
    if (got !== want) problems.push(`${name} is ${got ?? "unreadable"}, the tag is ${want}`);
  };
  versionOf("package.json", () => JSON.parse(files.packageJson).version);
  versionOf("cli/package.json", () => JSON.parse(files.cliPackageJson).version);
  versionOf("cli/src/version.ts", () => /CLI_VERSION\s*=\s*"([^"]*)"/.exec(files.cliVersionTs)?.[1]);
  return problems;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const tag = process.argv[2];
  if (!tag) {
    console.error("usage: check-version <tag>");
    process.exit(2);
  }
  const problems = checkVersion(tag, {
    packageJson: readFileSync("package.json", "utf8"),
    cliPackageJson: readFileSync("cli/package.json", "utf8"),
    cliVersionTs: readFileSync("cli/src/version.ts", "utf8"),
  });
  if (problems.length) {
    for (const p of problems) console.error(p);
    process.exit(1);
  }
  console.log(`All three files match ${tag}.`);
}
