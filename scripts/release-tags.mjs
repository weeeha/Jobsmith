#!/usr/bin/env node
// Image tags for a release tag, run by .github/workflows/release.yml.
//   release-tags <vX.Y.Z[-rc.N]>    prints one image tag per line, reading the
//                                   existing release tags from `git tag --list 'v*'`
// Floating tags (X.Y, X, latest) only ever move forward: a tag is added only
// when no existing stable tag in its range is higher. A prerelease gets its
// exact version and nothing else. Plain Node, no dependencies.
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const STABLE = /^v?(\d+)\.(\d+)\.(\d+)$/;
const PRERELEASE = /^v?(\d+)\.(\d+)\.(\d+)-[0-9A-Za-z.-]+$/;

/** [major, minor, patch] of a stable tag, or null for anything else. */
function stable(tag) {
  const m = STABLE.exec(tag);
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
}

function higher(a, b) {
  for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return a[i] > b[i];
  return false;
}

/**
 * @param {string} tag      the release tag, e.g. "v1.2.3" or "v0.9.0-rc.1"
 * @param {string[]} existing  tags already published, with or without the "v"
 * @returns {string[]}
 */
export function releaseTags(tag, existing) {
  if (PRERELEASE.test(tag)) return [tag.replace(/^v/, "")];
  const cur = stable(tag);
  if (!cur) throw new Error(`Not a release tag: ${tag}`);
  const others = existing.map(stable).filter(Boolean);
  const out = [cur.join(".")];
  if (!others.some((o) => o[0] === cur[0] && o[1] === cur[1] && higher(o, cur))) out.push(`${cur[0]}.${cur[1]}`);
  if (!others.some((o) => o[0] === cur[0] && higher(o, cur))) out.push(String(cur[0]));
  if (!others.some((o) => higher(o, cur))) out.push("latest");
  return out;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const tag = process.argv[2];
  if (!tag) {
    console.error("usage: release-tags <tag>");
    process.exit(2);
  }
  try {
    const existing = execFileSync("git", ["tag", "--list", "v*"], { encoding: "utf8" }).split("\n").filter(Boolean);
    console.log(releaseTags(tag, existing).join("\n"));
  } catch (e) {
    console.error(e instanceof Error ? e.message : String(e));
    process.exit(1);
  }
}
