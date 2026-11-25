// Drill's question order, pure (spec 5.4): the shakiest and the least
// recently drilled first, each question once.
import { DRILL_DEFAULT_COUNT, type MarkLevel } from "./values";

export type DrillCandidate = {
  questionKey: string;
  position: number;
  section: string | null;
  hasAnswer: boolean;
  level: MarkLevel | null;
  lastDrilledAt: Date | null;
};

const LEVEL_RANK: Record<MarkLevel | "unmarked", number> = { shaky: 0, okay: 1, unmarked: 2, solid: 3 };

function drilledRank(c: DrillCandidate): number {
  return c.lastDrilledAt === null ? Number.NEGATIVE_INFINITY : c.lastDrilledAt.getTime();
}

export function orderForDrill<T extends DrillCandidate>(
  candidates: T[],
  options: { count?: number; section?: string; onlyShaky?: boolean },
): T[] {
  let pool = candidates.filter((c) => c.hasAnswer);
  if (options.section !== undefined) pool = pool.filter((c) => c.section === options.section);
  if (options.onlyShaky) pool = pool.filter((c) => c.level === "shaky");

  const sorted = pool
    .map((c, index) => ({ c, index }))
    .sort((a, b) => {
      const level = LEVEL_RANK[a.c.level ?? "unmarked"] - LEVEL_RANK[b.c.level ?? "unmarked"];
      if (level !== 0) return level;
      const da = drilledRank(a.c);
      const db = drilledRank(b.c);
      if (da !== db) return da < db ? -1 : 1;
      return a.c.position - b.c.position || a.index - b.index;
    })
    .map((entry) => entry.c);

  const seen = new Set<string>();
  const unique = sorted.filter((c) => {
    if (seen.has(c.questionKey)) return false;
    seen.add(c.questionKey);
    return true;
  });
  if (options.section !== undefined) return unique;
  return unique.slice(0, Math.max(0, options.count ?? DRILL_DEFAULT_COUNT));
}
