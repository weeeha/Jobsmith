import { type Result, ok, fail } from "@/lib/result";
import type { Scoped } from "@/lib/db/scoped";
import { kindInfo } from "@/lib/artifacts/kinds";

export async function markArtifactSent(
  s: Scoped,
  opportunityId: string,
  key: string,
  version: number,
  now?: Date,
): Promise<Result<{ title: string }, "not_found" | "artifact_not_found" | "not_sendable" | "already_sent">> {
  const resolvedNow = now ?? new Date();

  return s.transaction(async (tx) => {
    const opportunity = await tx.opportunity.lockById(opportunityId);
    if (!opportunity) {
      return fail("not_found", "This job no longer exists.");
    }

    // Sendable kinds (cv, cover_letter, message_draft) are never
    // companyWide, so a sendable document is always job-scoped; this never
    // needs to consider company scope or lock the company row.
    const row = await tx.artifact.getVersion({ opportunityId: opportunity.id }, key, version);
    if (!row) {
      return fail("artifact_not_found", "This document no longer exists.");
    }
    if (!kindInfo(row.kind).sendable) {
      return fail("not_sendable", "Only CVs, cover letters and messages can be marked as sent.");
    }
    if (row.sentAt) {
      return fail("already_sent", "This version is already marked as sent.");
    }

    await tx.artifact.update(row.id, { sentAt: resolvedNow });
    await tx.event.insert({
      opportunityId: opportunity.id,
      stageId: row.stageId,
      kind: "document_sent",
      occurredAt: resolvedNow,
      meta: { key, version, title: row.title },
    });

    return ok({ title: row.title });
  });
}
