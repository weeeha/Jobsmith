import { diffArrays, diffWordsWithSpace } from "diff";
import {
  UNIT_DIFF_MAX_EDIT_LENGTH,
  WORD_MARK_MAX_CHARS,
  WORD_MARK_TIMEOUT_MS,
} from "./limits";

export type WordPart = { text: string; kind: "same" | "removed" | "added" };
export type DiffRow =
  | { type: "same"; units: string[] }
  | {
      type: "change";
      id: number;
      removed: string[];
      added: string[];
      words: { left: WordPart[]; right: WordPart[] } | null;
      wordsSkipped: boolean;
    };
export type DiffSummary = { wordsAdded: number; wordsRemoved: number; sectionsChanged: number };
export type DiffResult =
  | { ok: true; rows: DiffRow[]; summary: DiffSummary; changeCount: number }
  | { ok: false; reason: "too_different" };

type Limits = Partial<{ maxEditLength: number; wordMarkMaxChars: number; wordMarkTimeoutMs: number }>;

const H2 = /^## /;

function countWords(text: string): number {
  return text.split(/\s+/).filter(Boolean).length;
}

function lastHeading(units: string[], current: string): string {
  let heading = current;
  for (const unit of units) if (H2.test(unit)) heading = unit.replace(/\s+$/, "");
  return heading;
}

/** Heading in force after a row: same and added units count, and removed units only when nothing was added. */
function headingAfter(row: DiffRow, current: string): string {
  if (row.type === "same") return lastHeading(row.units, current);
  return lastHeading(row.added.length > 0 ? row.added : row.removed, current);
}

function markWords(
  removed: string[],
  added: string[],
  maxChars: number,
  timeoutMs: number,
): { left: WordPart[]; right: WordPart[] } | null {
  const left = removed.join("");
  const right = added.join("");
  if (left.length > maxChars || right.length > maxChars) return null;
  const parts = diffWordsWithSpace(left, right, { timeout: timeoutMs });
  if (!parts) return null;
  const l: WordPart[] = [];
  const r: WordPart[] = [];
  for (const part of parts) {
    if (part.added) r.push({ text: part.value, kind: "added" });
    else if (part.removed) l.push({ text: part.value, kind: "removed" });
    else {
      l.push({ text: part.value, kind: "same" });
      r.push({ text: part.value, kind: "same" });
    }
  }
  return { left: l, right: r };
}

export function diffUnits(a: string[], b: string[], limits: Limits = {}): DiffResult {
  const maxEditLength = limits.maxEditLength ?? UNIT_DIFF_MAX_EDIT_LENGTH;
  const maxChars = limits.wordMarkMaxChars ?? WORD_MARK_MAX_CHARS;
  const timeoutMs = limits.wordMarkTimeoutMs ?? WORD_MARK_TIMEOUT_MS;

  const parts = diffArrays(a, b, { maxEditLength });
  if (!parts) return { ok: false, reason: "too_different" };

  const rows: DiffRow[] = [];
  let wordsAdded = 0;
  let wordsRemoved = 0;
  let nextId = 1;
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    if (!part.added && !part.removed) {
      rows.push({ type: "same", units: part.value });
      continue;
    }
    let removed: string[] = [];
    let added: string[] = [];
    const take = (p: (typeof parts)[number]) => {
      if (p.removed) removed = p.value;
      else added = p.value;
    };
    take(part);
    const next = parts[i + 1];
    if (next && (next.added || next.removed) && next.added !== part.added) {
      take(next);
      i++;
    }
    const words = markWords(removed, added, maxChars, timeoutMs);
    if (words) {
      for (const w of words.left) if (w.kind === "removed") wordsRemoved += countWords(w.text);
      for (const w of words.right) if (w.kind === "added") wordsAdded += countWords(w.text);
    } else {
      wordsRemoved += countWords(removed.join(""));
      wordsAdded += countWords(added.join(""));
    }
    rows.push({ type: "change", id: nextId++, removed, added, words, wordsSkipped: words === null });
  }

  const sections = new Set<string>();
  let heading = "";
  for (const row of rows) {
    heading = headingAfter(row, heading);
    if (row.type === "change") sections.add(heading);
  }

  return {
    ok: true,
    rows,
    summary: { wordsAdded, wordsRemoved, sectionsChanged: sections.size },
    changeCount: nextId - 1,
  };
}

/** The nearest `## ` heading line (trailing whitespace trimmed, marker kept) at or before a row; "" before the first. */
export function sectionOf(rows: DiffRow[], index: number): string {
  let heading = "";
  for (let i = 0; i <= index && i < rows.length; i++) heading = headingAfter(rows[i], heading);
  return heading;
}
