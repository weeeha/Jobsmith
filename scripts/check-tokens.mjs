#!/usr/bin/env node
// Fails on raw hex colors, oklch()/rgb()/hsl(), stock Tailwind palette
// classes (bg-zinc-100, text-slate-500, ...) and Tailwind arbitrary VALUES
// (rounded-[14px], duration-[250ms]) under app/ and components/, excluding
// app/globals.css (where the token ramps themselves live) and two vendored,
// never-hand-edited-for-tokens directories: components/ui/ (shadcn
// primitives, which read theme variables through raw CSS functions like
// color-mix() by design) and components/super-ai/ (the Super AI Components
// registry installed on top of them).
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
// Comments are removed from the WHOLE FILE before it is scanned, by the
// character-by-character state machine in stripComments below, not by a
// regex and not line by line (round 2 of review tried both in turn). A
// regex cannot tell a comment from a comment-shaped span that is actually
// a STRING's own contents: a violation written as the literal text
// "/* #ff0000 */" inside a string would be deleted before the scan ever
// saw it. A per-line heuristic cannot tell a same-line "/* note */ code"
// apart from a line that is only a comment. The scanner tracks real state
// instead: string contents (single-, double- and back-quoted) are always
// kept, because a class name lives inside a string and must still be
// scanned; only genuine comments are removed, character for character,
// with every line break preserved so line numbers in the result match the
// original file exactly. The lint still reads text, not syntax, so it has
// no real parser: a regex literal or an apostrophe in JSX text can still
// misjudge a string boundary and cause a false positive, which is what the
// suppression comment below is for.
//
// A line containing check-tokens-ignore-next-line suppresses the single
// line below it, for a genuine false positive that cannot be expressed any
// other way (an anchor's href="#face", say); the reason for the suppression
// belongs in the same comment. The marker is looked for in the ORIGINAL
// source, before comments are stripped, because it lives inside one.
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const SCAN_ROOTS = ["app", "components"];
const EXCLUDE_FILES = new Set([path.join("app", "globals.css")]);
// Both are vendored registry code, never hand-edited for token compliance:
// components/ui/ is shadcn's own primitives, components/super-ai/ is the
// Super AI Components registry installed on top of them (Task 7).
const EXCLUDE_DIRS = [path.join("components", "ui"), path.join("components", "super-ai")];
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

/**
 * Removes comments from `source` (the WHOLE file's text, not one line),
 * returning text of the same length with the same line breaks in the same
 * places, so every line number and column in the result lines up exactly
 * with the original. String contents are kept as-is; only comments are
 * blanked out, character for character.
 *
 * A small state machine, not a regex: `code` is the default state. Seeing
 * two slashes or a slash followed by a star enters a comment state, unless
 * the two slashes are immediately preceded by ":" (a URL scheme, such as
 * "https://", written as plain JSX text rather than as a comment); seeing
 * a quote (single, double or back-tick) enters the matching string state.
 * Inside a comment state, every character becomes a space (line breaks
 * stay literal, so a multi-line block comment does not merge lines
 * together) until the comment closes: two slashes run to the next line
 * break; a block comment closes on its own star-then-slash marker, which
 * also covers a JSX comment, since that is the same block-comment syntax
 * wrapped in braces, and the braces are ordinary code-state characters
 * left alone (harmless, since a bare brace never matches any of this
 * script's violation patterns). Inside a string state, every character is
 * KEPT, because a class name lives inside a string and must still be
 * scanned; a backslash keeps itself and whatever follows it, so an
 * escaped quote cannot end the string early. A single- or double-quoted
 * string also ends at a line break (neither can legitimately span one,
 * and this stops a stray apostrophe in JSX text from swallowing the rest
 * of the file into a fake string); a template literal may span lines.
 *
 * Comment states are reachable only from `code`, and only they ever
 * delete anything, so a wrong guess about being inside a string can only
 * cause MORE of the file to be scanned, never less: it cannot hide a
 * genuine violation the way treating a string's own contents as a comment
 * (a regex's failure mode) could.
 *
 * @param {string} source
 * @returns {string}
 */
function stripComments(source) {
  const out = [];
  let state = "code";
  let i = 0;

  while (i < source.length) {
    const ch = source[i];
    const next = source[i + 1];

    if (state === "code") {
      // A "//" immediately preceded by ":" is a URL scheme (https://, ftp://,
      // ...) written as plain JSX text, not a comment: entering lineComment
      // here would blank the rest of the line, hiding any real code that
      // follows the URL on the same line.
      if (ch === "/" && next === "/" && source[i - 1] !== ":") {
        out.push(" ", " ");
        state = "lineComment";
        i += 2;
      } else if (ch === "/" && next === "*") {
        out.push(" ", " ");
        state = "blockComment";
        i += 2;
      } else if (ch === "'") {
        out.push(ch);
        state = "single";
        i += 1;
      } else if (ch === '"') {
        out.push(ch);
        state = "double";
        i += 1;
      } else if (ch === "`") {
        out.push(ch);
        state = "template";
        i += 1;
      } else {
        out.push(ch);
        i += 1;
      }
      continue;
    }

    if (state === "lineComment") {
      if (ch === "\n") {
        out.push("\n");
        state = "code";
      } else {
        out.push(" ");
      }
      i += 1;
      continue;
    }

    if (state === "blockComment") {
      if (ch === "*" && next === "/") {
        out.push(" ", " ");
        state = "code";
        i += 2;
      } else {
        out.push(ch === "\n" ? "\n" : " ");
        i += 1;
      }
      continue;
    }

    // state is "single", "double" or "template": a string, whose contents
    // are always kept so a class name inside one is still scanned.
    if (ch === "\\") {
      out.push(ch);
      if (next !== undefined) out.push(next);
      i += 2;
      continue;
    }

    if ((state === "single" || state === "double") && ch === "\n") {
      // A single- or double-quoted string cannot legitimately span a real
      // line break; bail back to `code` so one stray/unmatched quote (an
      // apostrophe in JSX text, say) cannot misread the rest of the file
      // as being inside a string.
      out.push("\n");
      state = "code";
      i += 1;
      continue;
    }

    out.push(ch);
    if (
      (state === "single" && ch === "'") ||
      (state === "double" && ch === '"') ||
      (state === "template" && ch === "`")
    ) {
      state = "code";
    }
    i += 1;
  }

  return out.join("");
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
  // Comments are stripped once, over the whole file, so the state machine
  // sees real preceding context (is this "*/" actually closing something,
  // is this quote actually inside a string) instead of guessing fresh on
  // every line. Line breaks are preserved character for character, so
  // splitting both the original and the stripped text on "\n" yields two
  // arrays of the same length, index-for-index the same lines.
  const rawLines = contents.split("\n");
  const scannableLines = stripComments(contents).split("\n");
  let suppressThisLine = false;

  rawLines.forEach((rawLine, index) => {
    const lineNumber = index + 1;
    const isSuppressed = suppressThisLine;
    suppressThisLine = false;

    // Checked against the ORIGINAL line, never the stripped one: a
    // suppression comment lives inside a comment, which stripComments has
    // already blanked out in scannableLines.
    if (rawLine.includes(SUPPRESS_MARKER)) {
      suppressThisLine = true;
    }

    if (isSuppressed) {
      return;
    }

    const scannable = scannableLines[index];

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

export function shouldSkip(relativePath) {
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
