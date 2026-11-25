import type { ArtifactRow, Scoped } from "@/lib/db/scoped";
import type { PrepQuestionFields } from "@/lib/db/scoped";
import { type Result, ok, fail } from "@/lib/result";
import { includeMatches, loadIncludeDocs, makeIncludeResolver } from "./includes";
import { parseQuestionBank } from "./parse";
import { PARSED_KINDS } from "./values";

function isParsedKind(kind: string): boolean {
  return (PARSED_KINDS as readonly string[]).includes(kind);
}

// Rebuilds one document's rows from its body. Runs on the caller's `tx`, so
// the rows commit or roll back with the artifact write. Marks are never
// touched: they key on question_key, not on these rows.
export async function rebuildForArtifact(
  tx: Scoped,
  artifact: ArtifactRow,
  options: { dependents?: boolean } = {},
): Promise<{ rows: number; warnings: number }> {
  const result = await rebuildOne(tx, artifact);
  // A changed document also changes every document of the job that includes it.
  // Includes go one level deep, so dependents never trigger more rebuilds.
  if (options.dependents !== false) await rebuildDependents(tx, artifact);
  return result;
}

const INCLUDE_FILE = /^\{\{include\s+(\S+)\s+\d+(?:\s+\S+)?\}\}\s*$/gm;

function includesDocument(bodyMd: string, key: string): boolean {
  for (const match of bodyMd.matchAll(INCLUDE_FILE)) {
    if (includeMatches(match[1], key)) return true;
  }
  return false;
}

async function rebuildDependents(tx: Scoped, artifact: ArtifactRow): Promise<void> {
  const opportunityId = artifact.opportunityId;
  if (opportunityId === null || !isParsedKind(artifact.kind)) return;
  for (const meta of await tx.artifact.listLatestForOpportunity(opportunityId)) {
    if (meta.key === artifact.key || !isParsedKind(meta.kind)) continue;
    const row = await tx.artifact.getLatest({ opportunityId }, meta.key);
    if (row && row.bodyMd.includes("{{include") && includesDocument(row.bodyMd, artifact.key)) {
      await rebuildOne(tx, row);
    }
  }
}

async function rebuildOne(
  tx: Scoped,
  artifact: ArtifactRow,
): Promise<{ rows: number; warnings: number }> {
  const opportunityId = artifact.opportunityId;
  if (opportunityId === null) return { rows: 0, warnings: 0 };

  if (!isParsedKind(artifact.kind)) {
    await tx.prepQuestion.replaceForArtifactKey(opportunityId, artifact.key, []);
    return { rows: 0, warnings: 0 };
  }

  const started = Date.now();

  // Other documents are only read when this body asks for one.
  const docs = artifact.bodyMd.includes("{{include")
    ? await loadIncludeDocs(tx, opportunityId, artifact.key)
    : [];

  const parsed = parseQuestionBank(artifact.bodyMd, { resolveInclude: makeIncludeResolver(docs) });
  const fields: PrepQuestionFields[] = parsed.questions.map((q) => ({
    opportunityId,
    artifactId: artifact.id,
    artifactVersion: artifact.version,
    artifactKey: artifact.key,
    stageId: artifact.stageId,
    section: q.section,
    number: q.number,
    position: q.position,
    question: q.question,
    questionKey: q.questionKey,
    blocks: q.blocks,
    spine: q.spine,
    lastLine: q.lastLine,
    guard: q.guard,
    unfilled: q.unfilled,
    hasAnswer: q.hasAnswer,
    unresolvedIncludes: q.unresolvedIncludes,
  }));

  const rows = await tx.prepQuestion.replaceForArtifactKey(opportunityId, artifact.key, fields);
  // Counts and ids only: a question is the owner's own interview text.
  console.info("[prep]", {
    opportunityId,
    key: artifact.key,
    rows,
    warnings: parsed.warnings.length,
    ms: Date.now() - started,
  });
  return { rows, warnings: parsed.warnings.length };
}

// Rebuilds every question bank and call card of one job from the latest
// version of each. Serves the hub's "Rebuild questions" and the backfill.
export async function rebuildForJob(
  s: Scoped,
  opportunityId: string,
): Promise<Result<{ documents: number; rows: number }, "not_found">> {
  return s.transaction(async (tx) => {
    const opportunity = await tx.opportunity.getById(opportunityId);
    if (!opportunity) return fail("not_found", "This job no longer exists.");

    const metas = await tx.artifact.listLatestForOpportunity(opportunityId);
    let documents = 0;
    let rows = 0;
    for (const meta of metas) {
      if (!isParsedKind(meta.kind)) continue;
      const row = await tx.artifact.getLatest({ opportunityId }, meta.key);
      if (!row) continue;
      const result = await rebuildForArtifact(tx, row, { dependents: false });
      documents += 1;
      rows += result.rows;
    }
    return ok({ documents, rows });
  });
}
