import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

// Parser modules that export ENV_NAMES. A path is read only when the file
// exists, so a later cycle's module joins by adding its path here.
export const PARSER_MODULES: string[] = [
  "lib/env.ts",
  "lib/ai/config.ts",
  "lib/auth/policy.ts",
  "lib/packs/files.ts",
  "lib/tts/config.ts",
  "lib/storage/config.ts",
  "lib/transcribe/config.ts",
  "lib/hosted/config.ts",
  "lib/email/config.ts",
  "lib/billing/config.ts",
  "lib/notify/config.ts",
  "lib/feed/config.ts",
];

export const repoPath = (...parts: string[]): string => path.join(process.cwd(), ...parts);

export function existingParserModules(): string[] {
  return PARSER_MODULES.filter((file) => existsSync(repoPath(file)));
}

export function readRepoFile(file: string): string {
  return readFileSync(repoPath(file), "utf8");
}

export function undocumentedNames(
  names: readonly string[],
  documented: ReadonlySet<string>,
): string[] {
  return names.filter((name) => !documented.has(name));
}

// Names on lines `NAME=` or `# NAME=`.
export function envExampleNames(text: string): Set<string> {
  const names = new Set<string>();
  for (const match of text.matchAll(/^(?:#\s*)?([A-Z][A-Z0-9_]*)=/gm)) names.add(match[1]);
  return names;
}

// Backticked upper-case names between `<!-- <block>:start -->` and
// `<!-- <block>:end -->`.
export function tableNames(markdown: string, block = "env-table"): Set<string> {
  const start = markdown.indexOf(`<!-- ${block}:start -->`);
  const end = markdown.indexOf(`<!-- ${block}:end -->`);
  if (start === -1 || end === -1 || end < start) {
    throw new Error(`markers for ${block} not found`);
  }
  const names = new Set<string>();
  for (const match of markdown.slice(start, end).matchAll(/`([A-Z][A-Z0-9_]+)`/g)) {
    names.add(match[1]);
  }
  return names;
}
