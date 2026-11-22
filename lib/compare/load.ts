import type { Scoped, ArtifactMeta, ArtifactRow, ArtifactScopeRef } from "@/lib/db/scoped";
import type { ArtifactKind } from "@/lib/artifacts/kinds";
import type { ArtifactOrigin } from "@/lib/artifacts/values";
import { editedBaseOf } from "@/lib/artifacts/plan";
import { fail, ok, type Result } from "@/lib/result";
import { diffUnits, type DiffResult } from "./diff";
import { resolvePair } from "./pair";
import { unitsForDiff } from "./units";

export type CompareVersion = {
  version: number;
  kind: ArtifactKind;
  title: string;
  origin: ArtifactOrigin;
  createdAt: Date;
  editedAt: Date | null;
  sentAt: Date | null;
  bodyMd: string;
};

export type Comparison = {
  title: string;
  versions: ArtifactMeta[];
  a: CompareVersion;
  b: CompareVersion;
  mode: "diff" | "same" | "too_different";
  diff: Extract<DiffResult, { ok: true }> | null;
  /** b carries "pushed after you edited version N". */
  notice: { baseVersion: number } | null;
};

function toVersion(row: ArtifactRow): CompareVersion {
  return {
    version: row.version,
    kind: row.kind,
    title: row.title,
    origin: row.origin,
    createdAt: row.createdAt,
    editedAt: row.editedAt,
    sentAt: row.sentAt,
    bodyMd: row.bodyMd,
  };
}

// Read-only: no transaction and no lock, like lib/artifacts/read.ts.
export async function loadComparison(
  s: Scoped,
  scope: ArtifactScopeRef,
  key: string,
  q: { a: number | null; b: number | null },
): Promise<Result<Comparison, "not_found">> {
  const notFound = fail("not_found", "Document or version not found");
  const versions = await s.artifact.listVersions(scope, key);
  const pair = resolvePair(versions, q);
  if (!pair) return notFound;

  const rowA = await s.artifact.getVersion(scope, key, pair.a);
  if (!rowA) return notFound;
  const rowB = pair.b === pair.a ? rowA : await s.artifact.getVersion(scope, key, pair.b);
  if (!rowB) return notFound;

  const a = toVersion(rowA);
  const b = toVersion(rowB);
  const base = { title: b.title, versions, a, b };

  if (pair.a === pair.b) return ok({ ...base, mode: "same", diff: null, notice: null });

  const baseVersion = editedBaseOf(versions, b.version);
  const notice = baseVersion === null ? null : { baseVersion };
  const result = diffUnits(unitsForDiff(a.bodyMd), unitsForDiff(b.bodyMd));
  if (!result.ok) return ok({ ...base, mode: "too_different", diff: null, notice });
  return ok({ ...base, mode: "diff", diff: result, notice });
}
