import type { Scoped, OpportunityRow } from "@/lib/db/scoped";
import { type Result, ok, fail } from "@/lib/result";
import { upsertArtifacts, type IncomingArtifact } from "@/lib/artifacts/upsert";
import type { ArtifactWarning } from "@/lib/artifacts/values";
import type { BridgeDeps } from "./auth";
import type { WirePushResponse, WireStatus } from "./wire";

export type PushInput = { opportunity: OpportunityRow; inputs: IncomingArtifact[]; dryRun: boolean; now: Date };

// One push through upsertArtifacts, with the revalidation that follows a
// change. The HTTP route and the write_document tool both call this, so the
// page refresh and the artifact_pushed event cannot drift apart. The origin is
// fixed to "pushed" here.
export async function applyPush(
  deps: BridgeDeps,
  s: Scoped,
  input: PushInput,
): Promise<Result<{ results: WirePushResponse["results"]; warnings: ArtifactWarning[] }, "not_found" | "invalid">> {
  const { opportunity, inputs, dryRun, now } = input;
  const outcome = await upsertArtifacts(s, opportunity.id, inputs, { origin: "pushed", dryRun, now });
  if (!outcome.ok) return fail(outcome.code, outcome.message);

  // A push (origin "pushed") never produces planUpsert's "edited" status:
  // that status is only ever returned for origin "manual". The cast below
  // is sound because of that origin guarantee, not a runtime check.
  const results = outcome.data.results.map((r) => ({
    key: r.key,
    scope: r.scope,
    status: r.status as WireStatus,
    version: r.version,
  }));

  const changed = results.some((r) => r.status !== "unchanged");
  if (!dryRun && changed) {
    deps.revalidate(`/jobs/${opportunity.slug}`);
    if (results.some((r) => r.status !== "unchanged" && r.scope === "company")) {
      const companySlugs = await s.opportunity.listSlugsForCompany(opportunity.companyId);
      for (const otherSlug of companySlugs) {
        if (otherSlug !== opportunity.slug) {
          deps.revalidate(`/jobs/${otherSlug}`);
        }
      }
    }
  }

  return ok({ results, warnings: outcome.data.warnings });
}
