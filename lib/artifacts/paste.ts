import { type Result, ok, fail } from "@/lib/result";
import { uniqueSlug } from "@/lib/pipeline/slug";
import type { Scoped } from "@/lib/db/scoped";
import { kindInfo, type ArtifactKind, type ArtifactTab } from "@/lib/artifacts/kinds";
import { keyFromTitle, normalizeBody, utf8Bytes } from "@/lib/artifacts/normalize";
import { applyUpserts, type IncomingArtifact, type UpsertResult } from "./upsert";
import type { ArtifactScope } from "./values";
import { MAX_ARTIFACT_BYTES } from "@/lib/bridge/wire";

export type PasteTarget = { mode: "new" } | { mode: "version"; scope: ArtifactScope; key: string };
export type PasteInput = { target: PasteTarget; title: string; kind: ArtifactKind; stageId: string | null; bodyMd: string };

export async function pasteArtifact(
  s: Scoped,
  opportunityId: string,
  input: PasteInput,
  now?: Date,
): Promise<Result<UpsertResult & { title: string; tab: ArtifactTab }, "not_found" | "artifact_not_found" | "invalid">> {
  const resolvedNow = now ?? new Date();

  return s.transaction(async (tx) => {
    const opportunity = await tx.opportunity.lockById(opportunityId);
    if (!opportunity) {
      return fail("not_found", "This job no longer exists.");
    }

    const stages = await tx.stage.listForOpportunity(opportunityId);

    let key: string;
    let scope: ArtifactScope;
    if (input.target.mode === "new") {
      // A brand-new paste never lands in company scope, regardless of the
      // chosen kind: sharing with the whole company only ever happens by
      // versioning an existing company-scoped document.
      scope = "opportunity";
      const jobKeys = await tx.artifact.listKeys({ opportunityId: opportunity.id });
      key = uniqueSlug(keyFromTitle(input.title), jobKeys);
    } else {
      scope = input.target.scope;
      key = input.target.key;
      const ref = scope === "opportunity" ? { opportunityId: opportunity.id } : { companyId: opportunity.companyId };
      const latest = await tx.artifact.getLatest(ref, key);
      if (!latest) {
        return fail("artifact_not_found", "This document no longer exists.");
      }
    }

    const normalized = normalizeBody(input.bodyMd);
    if (normalized.length === 0) {
      return fail("invalid", "Paste some markdown.");
    }
    if (utf8Bytes(input.bodyMd) > MAX_ARTIFACT_BYTES) {
      return fail("invalid", "Keep the markdown under 1 MB.");
    }

    // The paste dialog already resolves the stage to an id before calling
    // this, so this always uses the `{ id }` shape of StageInput, never
    // `{ ref }` (that shape is only for text a person typed at the CLI).
    const incoming: IncomingArtifact = {
      key,
      kind: input.kind,
      title: input.title,
      scope,
      stage: input.stageId ? { id: input.stageId } : null,
      bodyMd: input.bodyMd,
    };

    const outcome = await applyUpserts(tx, { opportunity, stages }, [incoming], { origin: "pasted", dryRun: false, now: resolvedNow });
    return ok({ ...outcome.results[0], title: input.title, tab: kindInfo(input.kind).tab });
  });
}
