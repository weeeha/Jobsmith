import type { Scoped } from "@/lib/db/scoped";
import { rebuildForJob } from "./rebuild";

// Thrown inside the dry run's transaction so the rebuild's writes roll back.
class DryRunRollback extends Error {}

export type BackfillSummary = { jobs: number; documents: number; questions: number };

// Rebuilds question rows for every job of one user. Safe to run twice: a
// rebuild replaces rows from the stored bodies and never touches marks. A job
// that fails is logged by id and skipped, so one bad document cannot stop the
// rest. A dry run does the same work inside a transaction it then rolls back,
// so its counts are exactly what a real run would write.
export async function backfillPrep(s: Scoped, options: { dryRun?: boolean } = {}): Promise<BackfillSummary> {
  const summary: BackfillSummary = { jobs: 0, documents: 0, questions: 0 };
  const opportunities = await s.opportunity.listAll();

  for (const opportunity of opportunities) {
    try {
      let counts: { documents: number; rows: number } | null = null;
      if (options.dryRun) {
        try {
          await s.transaction(async (tx) => {
            const result = await rebuildForJob(tx, opportunity.id);
            if (result.ok) counts = result.data;
            throw new DryRunRollback();
          });
        } catch (error) {
          if (!(error instanceof DryRunRollback)) throw error;
        }
      } else {
        const result = await rebuildForJob(s, opportunity.id);
        if (result.ok) counts = result.data;
      }
      if (!counts) continue;
      const { documents, rows } = counts as { documents: number; rows: number };
      summary.jobs += 1;
      summary.documents += documents;
      summary.questions += rows;
    } catch (error) {
      // The job id only: document text is the owner's interview material.
      console.error("[prep] backfill skipped a job", {
        opportunityId: opportunity.id,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
  return summary;
}
