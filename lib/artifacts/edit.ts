import { type Result, ok, fail } from "@/lib/result";
import type { Scoped } from "@/lib/db/scoped";
import type { DocRef } from "./tabs";
import { normalizeBody, hashBody, utf8Bytes } from "./normalize";
import { planUpsert } from "./plan";
import { MAX_ARTIFACT_BYTES } from "@/lib/bridge/wire";

export async function saveArtifactEdit(
  s: Scoped,
  opportunityId: string,
  ref: DocRef,
  bodyMd: string,
  now?: Date,
): Promise<Result<{ status: "edited" | "versioned" | "unchanged"; version: number; title: string }, "not_found" | "artifact_not_found" | "invalid">> {
  const resolvedNow = now ?? new Date();

  return s.transaction(async (tx) => {
    const opportunity = await tx.opportunity.lockById(opportunityId);
    if (!opportunity) {
      return fail("not_found", "This job no longer exists.");
    }

    if (ref.scope === "company") {
      await tx.company.lockById(opportunity.companyId);
    }

    const scopeRef = ref.scope === "opportunity" ? { opportunityId: opportunity.id } : { companyId: opportunity.companyId };
    const versions = await tx.artifact.listVersions(scopeRef, ref.key);
    if (versions.length === 0) {
      return fail("artifact_not_found", "This document no longer exists.");
    }
    const latest = versions[versions.length - 1];

    const normalized = normalizeBody(bodyMd);
    if (normalized.length === 0) {
      return fail("invalid", "The document cannot be empty.");
    }
    if (utf8Bytes(normalized) > MAX_ARTIFACT_BYTES) {
      return fail("invalid", "Keep the markdown under 1 MB.");
    }
    const hash = hashBody(normalized);

    const plan = planUpsert(
      versions,
      { origin: "manual", kind: latest.kind, title: latest.title, stageId: latest.stageId, bodyMd: normalized, hash },
      resolvedNow,
    );

    if (plan.status === "edited") {
      await tx.artifact.update(plan.id, plan.patch);
      return ok({ status: "edited", version: latest.version, title: latest.title });
    }
    if (plan.status === "versioned") {
      await tx.artifact.insert({
        opportunityId: ref.scope === "opportunity" ? opportunity.id : null,
        companyId: ref.scope === "company" ? opportunity.companyId : null,
        stageId: plan.insert.stageId,
        key: ref.key,
        version: plan.insert.version,
        kind: plan.insert.kind,
        title: plan.insert.title,
        bodyMd: plan.insert.bodyMd,
        contentHash: plan.insert.contentHash,
        sourceHash: plan.insert.sourceHash,
        origin: plan.insert.origin,
        editedAt: plan.insert.editedAt,
      });
      return ok({ status: "versioned", version: plan.insert.version, title: plan.insert.title });
    }
    // "unchanged": manual origin never reaches "created" (versions is
    // non-empty, checked above) or "updated" (manual short-circuits before
    // the metadata-patch rule), so this is the only remaining case.
    return ok({ status: "unchanged", version: latest.version, title: latest.title });
  });
}
