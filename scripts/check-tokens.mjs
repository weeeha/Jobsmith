#!/usr/bin/env node
// Fails on raw hex colors, oklch()/rgb()/hsl(), stock Tailwind palette
// classes (bg-zinc-100, text-slate-500, ...) and Tailwind arbitrary VALUES
// (rounded-[14px], duration-[250ms]) under app/ and components/, excluding
// app/globals.css (where the token ramps themselves live) and components/ui/
// (vendored shadcn primitives, which read theme variables through raw CSS
// functions like color-mix() by design).
//
// Arbitrary-value brackets are told apart from arbitrary VARIANT brackets
// (data-[state=open]:, group-data-[collapsible=icon]:, [&_svg]:) by what
// follows the closing bracket: a variant is always followed by ":", a value
// never is.
//
// An arbitrary value that is a bare CSS variable reference, [var(--token)]
// with nothing else inside the brackets, is allowed: components legitimately
// read design-system variables that way. Anything more than that inside the
// brackets, such as [var(--token)_solid] or [calc(var(--token)+2px)], is
// still a violation.
//
// A line that is only a comment (trimmed text starting with "//", "/*", "*"
// or "{/*") is not scanned at all, so a comment that merely mentions rgb()
// or a hex color is not flagged; a code line with a trailing comment is
// still scanned in full. A line containing check-tokens-ignore-next-line
// suppresses the single line below it, for a genuine false positive that
// cannot be expressed any other way (an anchor's href="#face", say); the
// reason for the suppression belongs in the same comment.
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const SCAN_ROOTS = ["app", "components"];
const EXCLUDE_FILES = new Set([path.join("app", "globals.css")]);
const EXCLUDE_DIRS = [path.join("components", "ui")];
const SCAN_EXTENSIONS = new Set([".ts", ".tsx", ".css", ".mjs"]);

const TAILWIND_PALETTE_COLORS = [
  "slate", "gray", "zinc", "neutral", "stone",
  "red", "orange", "amber", "yellow", "lime", "green", "emerald",
  "teal", "cyan", "sky", "blue", "indigo", "violet", "purple",
  "fuchsia", "pink", "rose", "black", "white",
];

const PALETTE_PREFIXES = [
  "bg", "text", "border", "ring", "fill", "stroke", "from", "via", "to",
  "outline", "decoration", "divide", "caret", "accent", "shadow", "placeholder",
];

const PALETTE_CLASS_RE = new RegExp(
  `\\b(?:${PALETTE_PREFIXES.join("|")})-(?:${TAILWIND_PALETTE_COLORS.join("|")})(?:-[0-9]{2,3})?\\b`,
  "g",
);

const HEX_COLOR_RE = /#(?:[0-9a-fA-F]{3,4}){1,2}\b/g;
const RAW_FUNCTION_RE = /\b(?:oklch|rgb|hsl)\(/g;
// Captures the prefix and the bracket contents separately so a bare var()
// reference inside the brackets can be told apart from anything else.
const ARBITRARY_VALUE_RE = /([a-zA-Z][a-zA-Z0-9]*)-\[([^\]]+)\]/g;
const ARBITRARY_VALUE_VAR_ONLY_RE = /^var\(--[a-zA-Z0-9_-]+\)$/;

// A suppression comment: "<anything>check-tokens-ignore-next-line<reason>"
// on one line skips the single line below it. For genuine false positives
// only, and every use must carry its reason in the same comment.
const SUPPRESS_MARKER = "check-tokens-ignore-next-line";

function isCommentOnlyLine(line) {
  const trimmed = line.trim();
  return (
    trimmed.startsWith("//") ||
    trimmed.startsWith("/*") ||
    trimmed.startsWith("*") ||
    trimmed.startsWith("{/*")
  );
}

/** @typedef {{ file: string, line: number, rule: string, text: string }} Violation */

/**
 * @param {string} filePath
 * @param {string} contents
 * @returns {Violation[]}
 */
export function findViolations(filePath, contents) {
  /** @type {Violation[]} */
  const violations = [];
  const lines = contents.split("\n");
  let suppressThisLine = false;

  lines.forEach((line, index) => {
    const lineNumber = index + 1;
    const isSuppressed = suppressThisLine;
    suppressThisLine = false;

    // Checked unconditionally: a suppression comment can itself be a
    // comment-only line (the usual case) without losing its effect on the
    // line below it.
    if (line.includes(SUPPRESS_MARKER)) {
      suppressThisLine = true;
    }

    if (isSuppressed || isCommentOnlyLine(line)) {
      return;
    }

    for (const match of line.matchAll(HEX_COLOR_RE)) {
      violations.push({ file: filePath, line: lineNumber, rule: "raw-hex-color", text: match[0] });
    }

    for (const match of line.matchAll(RAW_FUNCTION_RE)) {
      violations.push({ file: filePath, line: lineNumber, rule: "raw-color-function", text: match[0] });
    }

    for (const match of line.matchAll(PALETTE_CLASS_RE)) {
      violations.push({ file: filePath, line: lineNumber, rule: "tailwind-palette-class", text: match[0] });
    }

    for (const match of line.matchAll(ARBITRARY_VALUE_RE)) {
      const fullText = match[0];
      const bracketContents = match[2];
      const nextChar = line[match.index + fullText.length];
      if (nextChar === ":") continue; // arbitrary variant, not a value
      if (ARBITRARY_VALUE_VAR_ONLY_RE.test(bracketContents)) continue; // bare var() reference
      violations.push({ file: filePath, line: lineNumber, rule: "arbitrary-value", text: fullText });
    }
  });

  return violations;
}

function shouldSkip(relativePath) {
  if (EXCLUDE_FILES.has(relativePath)) return true;
  return EXCLUDE_DIRS.some((dir) => relativePath === dir || relativePath.startsWith(dir + path.sep));
}

function walk(dir, root, results) {
  let entries;
  try {
    entries = readdirSync(dir);
  } catch (error) {
    if (error.code === "ENOENT") return;
    throw error;
  }

  for (const entry of entries) {
    const fullPath = path.join(dir, entry);
    const relativePath = path.relative(root, fullPath);
    if (shouldSkip(relativePath)) continue;

    const stats = statSync(fullPath);
    if (stats.isDirectory()) {
      walk(fullPath, root, results);
    } else if (SCAN_EXTENSIONS.has(path.extname(fullPath))) {
      results.push(fullPath);
    }
  }
}

/** @param {string} [root] */
export function collectFiles(root = process.cwd()) {
  const files = [];
  for (const dirName of SCAN_ROOTS) {
    walk(path.join(root, dirName), root, files);
  }
  return files;
}

function main() {
  const root = process.cwd();
  const files = collectFiles(root);
  /** @type {Violation[]} */
  const allViolations = [];

  for (const file of files) {
    const relativePath = path.relative(root, file);
    const contents = readFileSync(file, "utf8");
    allViolations.push(...findViolations(relativePath, contents));
  }

  if (allViolations.length > 0) {
    console.error(`check:tokens found ${allViolations.length} violation(s):\n`);
    for (const violation of allViolations) {
      console.error(`  ${violation.file}:${violation.line}  [${violation.rule}]  ${violation.text}`);
    }
    process.exitCode = 1;
  } else {
    console.log(`check:tokens: scanned ${files.length} files, no violations.`);
  }
}

// Compared via pathToFileURL (not a `file://${process.argv[1]}` template
// literal) because import.meta.url percent-encodes characters that can
// appear in a real filesystem path, such as a space in a repository path
// that contains a space; the naive template literal does not encode them,
// so the two would never match and this script would silently never run
// its check.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
