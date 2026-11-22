import { editedBaseOf, type VersionState } from "@/lib/artifacts/plan";
import { formatDocRef, parseDocRef, type DocRef } from "@/lib/artifacts/tabs";

export type CompareView = "split" | "inline";
export type CompareQuery = { doc: DocRef | null; a: number | null; b: number | null; view: CompareView | null };

type Versions = Pick<VersionState, "version" | "origin" | "editedAt">[];

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function parseVersionNumber(value: string | undefined): number | null {
  if (value === undefined || !/^\d+$/.test(value)) return null;
  const n = Number(value);
  return Number.isSafeInteger(n) && n >= 1 ? n : null;
}

export function parseCompareQuery(params: Record<string, string | string[] | undefined>): CompareQuery {
  const view = first(params.view);
  return {
    doc: parseDocRef(first(params.doc)),
    a: parseVersionNumber(first(params.a)),
    b: parseVersionNumber(first(params.b)),
    view: view === "split" || view === "inline" ? view : null,
  };
}

export function defaultPair(versions: Versions, baseOf: typeof editedBaseOf = editedBaseOf): { a: number; b: number } | null {
  if (versions.length < 2) return null;
  const numbers = versions.map((v) => v.version).sort((x, y) => x - y);
  const b = numbers[numbers.length - 1];
  const base = baseOf(versions, b);
  if (base !== null && numbers.includes(base)) return { a: base, b };
  return { a: numbers[numbers.length - 2], b };
}

export function resolvePair(versions: Versions, q: { a: number | null; b: number | null }): { a: number; b: number } | null {
  const fallback = defaultPair(versions);
  const a = q.a ?? fallback?.a ?? null;
  const b = q.b ?? fallback?.b ?? null;
  if (a === null || b === null) return null;
  const known = new Set(versions.map((v) => v.version));
  return known.has(a) && known.has(b) ? { a, b } : null;
}

export function formatCompareHref(base: string, p: { doc: DocRef; a?: number; b?: number; view?: CompareView }): string {
  // Company pages take the bare key; job pages take the prefixed ref.
  const doc = base.startsWith("/companies/") ? p.doc.key : formatDocRef(p.doc);
  const parts = [`doc=${doc}`];
  if (p.a !== undefined) parts.push(`a=${p.a}`);
  if (p.b !== undefined) parts.push(`b=${p.b}`);
  if (p.view !== undefined) parts.push(`view=${p.view}`);
  return `${base}?${parts.join("&")}`;
}
