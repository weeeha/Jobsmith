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
// Comments are removed from a line before it is scanned, rather than the
// whole line being skipped whenever it merely starts with a comment opener
// (round 1 of review did that, and a same-line comment followed by real
// code, e.g. `/* note */ const bg = "#ff0000";`, slipped through unscanned
// as a result). A "//" that starts the trimmed line runs to the end of the
// line and empties it. A block comment, "/* ... */" or the JSX "{/* ... */}",
// that both opens and closes on the same line is cut out and whatever
// remains on that line (before or after it) is still scanned. A line whose
// trimmed text opens "/*" or "{/*" without closing it on that line is
// comment for its full length; a line whose trimmed text starts with "*" is
// a continuation of such a comment, comment-only unless it contains the
// closing "*/", in which case only what follows that closer is scanned. A
// "//" that does NOT start the trimmed line is a trailing comment on real
// code and is left alone: the whole line, comment included, is scanned
// exactly as before, so a violation in the code ahead of it is still found.
// A line containing check-tokens-ignore-next-line suppresses the single
// line below it, for a genuine false positive that cannot be expressed any
// other way (an anchor's href="#face", say); the reason for the suppression
// belongs in the same comment.
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

// Same-line block comments, used both to strip them (the "g" versions, safe
// to reuse across calls: String#replace resets a global regex's lastIndex
// to 0 once it finishes) and to test whether one closes on a given line
// (separate non-global versions, since reusing a global regex's stateful
// lastIndex across repeated `.test()` calls is a classic bug).
const JSX_BLOCK_COMMENT_RE = /\{\/\*[\s\S]*?\*\/\}/g;
const PLAIN_BLOCK_COMMENT_RE = /\/\*[\s\S]*?\*\//g;
const CLOSES_JSX_BLOCK_COMMENT_RE = /\{\/\*[\s\S]*?\*\/\}/;
const CLOSES_PLAIN_BLOCK_COMMENT_RE = /\/\*[\s\S]*?\*\//;

/**
 * Returns the portion of `line` that should be scanned for violations, with
 * comments removed: a "//" that starts the trimmed line, or a block comment
 * that does not close on this line, empties it; a block comment continuation
 * ("*...") scans only what follows its closing "*\/", if any; a block
 * comment that opens and closes on the same line is cut out in place and
 * the rest of the line (both before and after it) is kept. A line with no
 * comment marker at all is returned unchanged.
 * @param {string} line
 * @returns {string}
 */
function stripComments(line) {
  const trimmed = line.trim();

  if (trimmed.startsWith("//")) {
    return "";
  }

  if (trimmed.startsWith("*")) {
    const closeIndex = trimmed.indexOf("*/");
    return closeIndex === -1 ? "" : trimmed.slice(closeIndex + 2);
  }

  if (trimmed.startsWith("{/*") && !CLOSES_JSX_BLOCK_COMMENT_RE.test(line)) {
    return "";
  }

  if (trimmed.startsWith("/*") && !CLOSES_PLAIN_BLOCK_COMMENT_RE.test(line)) {
    return "";
  }

  return line.replace(JSX_BLOCK_COMMENT_RE, " ").replace(PLAIN_BLOCK_COMMENT_RE, " ");
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

    // Checked unconditionally, against the raw line: a suppression comment
    // can itself be a comment-only line (the usual case) without losing its
    // effect on the line below it.
    if (line.includes(SUPPRESS_MARKER)) {
      suppressThisLine = true;
    }

    if (isSuppressed) {
      return;
    }

    const scannable = stripComments(line);

    for (const match of scannable.matchAll(HEX_COLOR_RE)) {
      violations.push({ file: filePath, line: lineNumber, rule: "raw-hex-color", text: match[0] });
    }

    for (const match of scannable.matchAll(RAW_FUNCTION_RE)) {
      violations.push({ file: filePath, line: lineNumber, rule: "raw-color-function", text: match[0] });
    }

    for (const match of scannable.matchAll(PALETTE_CLASS_RE)) {
      violations.push({ file: filePath, line: lineNumber, rule: "tailwind-palette-class", text: match[0] });
    }

    for (const match of scannable.matchAll(ARBITRARY_VALUE_RE)) {
      const fullText = match[0];
      const bracketContents = match[2];
      const nextChar = scannable[match.index + fullText.length];
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
