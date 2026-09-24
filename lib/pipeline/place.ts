import type { Scoped } from "@/lib/db/scoped";
import { type Result, ok } from "@/lib/result";
import { moveOpportunity } from "@/lib/pipeline/move";
import type { MoveError } from "@/lib/pipeline/rules";
import type { StageKind } from "@/lib/pipeline/kinds";

// The only way a job is ever placed somewhere other than Saved: the add
// dialog, the import script and the seed all call this rather than
// moveOpportunity directly. Routing every placement through
// Applied first keeps history truthful — a job that sits at the recruiter
// screen was applied to first, so jumping there straight from Saved would
// mark Applied as skipped, which is wrong.
export async function placeOpportunity(
  s: Scoped,
  opportunityId: string,
  kind: StageKind,
  options?: { appliedAt?: Date; now?: Date },
): Promise<Result<null, MoveError>> {
  if (kind === "saved") {
    return ok(null);
  }

  const resolvedNow = options?.now ?? new Date();
  const appliedAt = options?.appliedAt ?? resolvedNow;

  const applied = await moveOpportunity(s, opportunityId, { kind: "applied" }, appliedAt);
  if (!applied.ok) {
    return applied;
  }

  if (kind === "applied") {
    return ok(null);
  }

  const further = await moveOpportunity(s, opportunityId, { kind }, resolvedNow);
  if (!further.ok) {
    return further;
  }

  return ok(null);
}
