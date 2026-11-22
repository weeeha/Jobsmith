import type { Scoped } from "@/lib/db/scoped";
import type { MarkLevel } from "@/lib/prep/values";
import { LIBRARY_COPY } from "./copy";

// "Used in N jobs": distinct jobs with a question row of each key (spec 5.8).
// Every requested key is in the map, 0 when no row holds it.
export async function usedInJobs(s: Scoped, questionKeys: string[]): Promise<Map<string, number>> {
  const counts = await s.prepQuestion.countJobsByQuestionKey(questionKeys);
  return new Map(questionKeys.map((key) => [key, counts.get(key) ?? 0]));
}

export function usedInText(n: number): string {
  return LIBRARY_COPY.usedIn(n);
}

type MarkLine = { level: MarkLevel; markedAt: Date; drillCount: number; lastDrilledAt: Date | null };

export type MarkHistory = {
  jobs: (MarkLine & { opportunityId: string; slug: string; roleTitle: string; companyName: string })[];
  library: MarkLine | null;
};

// Every job's mark for one question, newest first, and the library mark.
export async function markHistory(s: Scoped, questionKey: string): Promise<MarkHistory> {
  const marks = await s.prepMark.listForQuestionKey(questionKey);
  const jobs: MarkHistory["jobs"] = [];
  let library: MarkLine | null = null;
  const companyNames = new Map<string, string | null>();
  for (const mark of [...marks].sort((x, y) => y.markedAt.getTime() - x.markedAt.getTime())) {
    const line = {
      level: mark.level,
      markedAt: mark.markedAt,
      drillCount: mark.drillCount,
      lastDrilledAt: mark.lastDrilledAt,
    };
    if (mark.scope === "library") {
      library = line;
      continue;
    }
    if (mark.opportunityId === null) continue;
    const opportunity = await s.opportunity.getById(mark.opportunityId);
    if (!opportunity) continue;
    if (!companyNames.has(opportunity.companyId)) {
      companyNames.set(opportunity.companyId, (await s.company.getById(opportunity.companyId))?.name ?? null);
    }
    jobs.push({
      ...line,
      opportunityId: opportunity.id,
      slug: opportunity.slug,
      roleTitle: opportunity.roleTitle,
      companyName: companyNames.get(opportunity.companyId) ?? "",
    });
  }
  return { jobs, library };
}
