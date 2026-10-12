import { attentionItems, type AttentionItem } from "@/lib/attention";
import type { Scoped } from "@/lib/db/scoped";
import { STAGE_KINDS, type StageKind } from "@/lib/pipeline/kinds";
import { loadProfile } from "@/lib/profile/store";

export type PipelineCount = { kind: StageKind; label: string; count: number };
export type RecentPush = {
  id: string;
  slug: string;
  roleTitle: string;
  companyName: string;
  occurredAt: Date;
  documents: number;
};
export type HomeView = { items: AttentionItem[]; hasActiveJobs: boolean; counts: PipelineCount[]; pushes: RecentPush[] };

export const RECENT_PUSHES_LIMIT = 5;

// A push event's meta lists the documents it changed.
function documentsIn(meta: unknown): number {
  if (typeof meta !== "object" || meta === null) return 0;
  const items = (meta as { items?: unknown }).items;
  return Array.isArray(items) ? items.length : 0;
}

/**
 * Everything the Home page shows, read for one user at one moment. `now`
 * comes in as an argument so the page and the tests choose the clock.
 */
export async function getHomeView(s: Scoped, now: Date): Promise<HomeView> {
  const profile = await loadProfile(s);
  const [opportunities, scheduledStages, board, pushes] = await Promise.all([
    s.opportunity.listForAttention(),
    s.stage.listScheduledActive(),
    s.opportunity.listBoard(),
    s.event.listRecentPushes(RECENT_PUSHES_LIMIT),
  ]);

  const items = attentionItems({
    opportunities,
    scheduledStages,
    now,
    timeZone: profile.timezone,
    settings: profile.preferences.attention,
  });

  const counts = STAGE_KINDS.map(({ kind, columnTitle }) => ({
    kind,
    label: columnTitle,
    count: board.filter((card) => card.stage.kind === kind).length,
  }));

  return {
    items,
    hasActiveJobs: board.length > 0,
    counts,
    pushes: pushes.map((push) => ({
      id: push.id,
      slug: push.slug,
      roleTitle: push.roleTitle,
      companyName: push.companyName,
      occurredAt: push.occurredAt,
      documents: documentsIn(push.meta),
    })),
  };
}
