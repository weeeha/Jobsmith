import type { RecentPush, Scoped } from "@/lib/db/scoped";
import { STAGE_KINDS, type StageKind } from "@/lib/pipeline/kinds";
import { parsePreferences } from "@/lib/preferences/schema";
import { DEFAULT_TIME_ZONE } from "@/lib/profile";
import { isTimeZone } from "@/lib/time/zone";
import { attentionItems, INTERVIEW_RESEARCH_KINDS, type AttentionItem } from "./items";

export const RECENT_PUSHES = 5;

export type ColumnCount = { kind: StageKind; title: string; count: number };
export type HomeData = { items: AttentionItem[]; columns: ColumnCount[]; pushes: RecentPush[]; timeZone: string };

export async function loadHome(s: Scoped, now: Date): Promise<HomeData> {
  const [profile, board, scheduled, lastEvents, pushes, researched] = await Promise.all([
    s.profile.get(),
    s.opportunity.listBoard(),
    s.stage.listScheduledForActive(),
    s.event.lastOccurredByOpportunity(),
    s.artifact.listRecentPushed(RECENT_PUSHES),
    s.artifact.opportunityIdsWithKinds(INTERVIEW_RESEARCH_KINDS),
  ]);
  const preferences = parsePreferences(profile?.preferences);
  const timeZone = profile?.timezone && isTimeZone(profile.timezone) ? profile.timezone : DEFAULT_TIME_ZONE;

  const items = attentionItems({
    now,
    timeZone,
    followUpDays: preferences.attention.followUpDays,
    savedDays: preferences.attention.savedDays,
    jobs: board.map((card) => ({
      id: card.id,
      slug: card.slug,
      roleTitle: card.roleTitle,
      companyName: card.companyName,
      nextAction: card.nextAction,
      nextActionAt: card.nextActionAt,
      stage: { kind: card.stage.kind, label: card.stage.label, enteredAt: card.stage.enteredAt },
      lastEventAt: lastEvents.get(card.id) ?? null,
      researched: researched.has(card.id),
    })),
    scheduled,
  });

  // All seven columns, zeros included, under the board's own column titles.
  const columns = STAGE_KINDS.map((k) => ({
    kind: k.kind,
    title: k.columnTitle,
    count: board.filter((card) => card.stage.kind === k.kind).length,
  }));

  return { items, columns, pushes, timeZone };
}
