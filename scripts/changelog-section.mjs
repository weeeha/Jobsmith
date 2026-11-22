#!/usr/bin/env node
// The CHANGELOG.md section of one version, run by .github/workflows/release.yml.
//   changelog-section <version> [file]    prints the body under "## [version]"
// Without a CHANGELOG.md (it arrives with Task 47) it prints "No changelog yet."
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

/** The body under `## [version]`, up to the next `## [`, trimmed; "" when absent. */
export function changelogSection(markdown, version) {
  const lines = markdown.split(/\r?\n/);
  const heading = (l) => /^## \[/.test(l);
  const start = lines.findIndex((l) => heading(l) && l.startsWith(`## [${version}]`));
  if (start < 0) return "";
  const rest = lines.slice(start + 1);
  const end = rest.findIndex(heading);
  return (end < 0 ? rest : rest.slice(0, end)).join("\n").trim();
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const version = (process.argv[2] ?? "").replace(/^v/, "");
  const file = process.argv[3] ?? "CHANGELOG.md";
  if (!version) {
    console.error("usage: changelog-section <version> [file]");
    process.exit(2);
  }
  if (!existsSync(file)) {
    console.log("No changelog yet.");
  } else {
    const body = changelogSection(readFileSync(file, "utf8"), version);
    if (!body) {
      console.error(`${file} has no section "## [${version}]"`);
      process.exit(1);
    }
    console.log(body);
  }
}
