import { KEY_PATTERN, MAX_ARTIFACT_BYTES, type WireArtifact } from "@/lib/bridge/wire";
import { splitFrontmatter } from "./frontmatter";
import { BUILT_IN_SUFFIXES, mergeSuffixes, lookupSuffix, type SuffixEntry } from "./suffixes";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

export type Collected = { items: WireArtifact[]; notes: string[] };

export async function collectPacket(
  options: { dir: string; prefix: string },
): Promise<{ ok: true; value: Collected } | { ok: false; message: string }> {
  let mergedSuffixes: Record<string, SuffixEntry> = BUILT_IN_SUFFIXES;

  let configText: string | null = null;
  try {
    configText = await readFile(path.join(options.dir, "jobsmith.config.json"), "utf8");
  } catch (error) {
    // A missing per-folder config is the normal case, not a mistake: every
    // other read failure (permissions, a directory sitting in its place)
    // is something collection cannot recover from on its own.
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      const reason = error instanceof Error && error.message ? error.message : "the file could not be read";
      return { ok: false, message: `Could not read jobsmith.config.json: ${reason}.` };
    }
  }

  if (configText !== null) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(configText);
    } catch (error) {
      const reason = error instanceof Error && error.message ? error.message : "the file could not be read";
      return { ok: false, message: `Could not read jobsmith.config.json: ${reason}.` };
    }
    const suffixesValue =
      parsed !== null && typeof parsed === "object" && "suffixes" in parsed
        ? (parsed as { suffixes: unknown }).suffixes
        : undefined;
    const suffixesObject: Record<string, SuffixEntry> =
      suffixesValue !== null && typeof suffixesValue === "object" && !Array.isArray(suffixesValue)
        ? (suffixesValue as Record<string, SuffixEntry>)
        : {};
    mergedSuffixes = mergeSuffixes(BUILT_IN_SUFFIXES, suffixesObject);
  }

  let entries: string[];
  try {
    entries = await readdir(options.dir);
  } catch (error) {
    // A missing --dir is the common typo and gets the same line as an
    // existing but empty one, since both mean "nothing to push here." Any
    // other failure (no permission, a file where a directory belongs) names
    // itself instead, so it never reaches the caller as a raw stack trace.
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return { ok: false, message: `No ${options.prefix}-*.md files in ${options.dir}.` };
    }
    const reason = error instanceof Error && error.message ? error.message : "the directory could not be read";
    return { ok: false, message: `Could not read ${options.dir}: ${reason}.` };
  }

  const names = entries.filter((n) => n.startsWith(`${options.prefix}-`) && n.endsWith(".md")).sort();

  if (names.length === 0) {
    return { ok: false, message: `No ${options.prefix}-*.md files in ${options.dir}.` };
  }

  const items: WireArtifact[] = [];
  const notes: string[] = [];

  for (const name of names) {
    const raw = await readFile(path.join(options.dir, name), "utf8");
    const split = splitFrontmatter(raw);
    const body = split.body;
    // Record<string, string> only reflects the keys that were actually
    // present; treating an absent key as `string` (this tsconfig has no
    // noUncheckedIndexedAccess) would hide that a frontmatter field was
    // never supplied, so the lookups below need the honest, optional type.
    const data = split.data as Record<string, string | undefined>;

    if (data.jobsmith === "context/v1") {
      // A pulled context document sitting in the same folder: expected,
      // not a mistake, so it is skipped with no note at all.
      continue;
    }

    const key = name.slice(options.prefix.length + 1, -".md".length).toLowerCase();
    if (!KEY_PATTERN.test(key)) {
      notes.push(`Note: skipped ${name}: the key does not match the required pattern.`);
      continue;
    }

    const entry = lookupSuffix(key, mergedSuffixes);
    const kind = data.kind ?? entry?.kind ?? "other";
    if (!data.kind && !entry?.kind) {
      notes.push(`Note: ${name} has no kind in the suffix map, pushing it as other.`);
    }

    const stage = data.stage ?? entry?.stage;
    const title = data.title ?? entry?.title;

    const scope = data.scope ?? entry?.scope ?? "opportunity";
    if (scope !== "opportunity" && scope !== "company") {
      // An invalid scope stops the whole push immediately, unlike a bad
      // key or an empty body, which only skip that one file.
      return { ok: false, message: `${name}: scope must be opportunity or company.` };
    }

    const bodyBytes = Buffer.byteLength(body, "utf8");
    if (bodyBytes > MAX_ARTIFACT_BYTES) {
      return { ok: false, message: `${name} is larger than 1 MB. Split it or leave it out.` };
    }

    if (body.trim() === "") {
      notes.push(`Note: skipped ${name}: the body is empty.`);
      continue;
    }

    items.push({
      key,
      kind,
      body_md: body,
      scope: scope as "opportunity" | "company",
      ...(stage !== undefined ? { stage } : {}),
      ...(title !== undefined ? { title } : {}),
    });
  }

  return { ok: true, value: { items, notes } };
}
