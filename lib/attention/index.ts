import { atTimeDaysLater, calendarDaysBetween, startOfDayIn } from "@/lib/time/zone";
import type { AttentionOpportunity, AttentionStage } from "./types";

export const INTERVIEW_WINDOW_MS = 72 * 60 * 60 * 1000;

// Spec order: this is the order Home lists them in.
export const ATTENTION_RULES = ["interview_soon", "next_action_due", "follow_up", "apply_or_drop", "mark_done"] as const;
export type AttentionRule = (typeof ATTENTION_RULES)[number];

export const SNOOZABLE_RULES = ["next_action_due", "follow_up", "apply_or_drop"] as const;
export type SnoozableRule = (typeof SNOOZABLE_RULES)[number];

export type AttentionInput = {
  opportunities: AttentionOpportunity[];
  scheduledStages: AttentionStage[];
  now: Date;
  timeZone: string;
  settings: { followUpDays: number; savedDays: number };
};

export type AttentionItem = {
  key: string;
  rule: AttentionRule;
  opportunityId: string;
  slug: string;
  roleTitle: string;
  companyName: string;
  at: Date | null;
  stage: { id: string; label: string } | null;
  nextAction: string | null;
  days: number | null;
  overdue: boolean;
  snoozable: boolean;
};

function isSnoozable(rule: AttentionRule): boolean {
  return (SNOOZABLE_RULES as readonly AttentionRule[]).includes(rule);
}

function byTimeThenKey(a: AttentionItem, b: AttentionItem): number {
  const delta = (a.at?.getTime() ?? 0) - (b.at?.getTime() ?? 0);
  if (delta !== 0) return delta;
  return a.key < b.key ? -1 : a.key > b.key ? 1 : 0;
}

/**
 * Everything Home asks the user to act on, as one pure function: the clock
 * and the profile zone come in as arguments, so a fixed `now` and zone give a
 * fixed answer.
 *
 * Items are per (rule, job) or per (rule, stage), so a job can appear under a
 * stage rule and a next-action rule at once. A job with a next action is
 * "being handled": an undated one or one due later hides it from the quiet
 * job rules (follow-up, apply or drop).
 */
export function attentionItems(input: AttentionInput): AttentionItem[] {
  const { now, timeZone, settings } = input;
  const jobs = new Map(input.opportunities.map((job) => [job.id, job]));
  const startOfToday = startOfDayIn(now, timeZone);
  const startOfTomorrow = atTimeDaysLater(now, timeZone, 1, 0, 0);

  const common = (job: AttentionOpportunity) => ({
    opportunityId: job.id,
    slug: job.slug,
    roleTitle: job.roleTitle,
    companyName: job.companyName,
  });
  const groups: Record<AttentionRule, AttentionItem[]> = {
    interview_soon: [],
    next_action_due: [],
    follow_up: [],
    apply_or_drop: [],
    mark_done: [],
  };

  for (const stage of input.scheduledStages) {
    const job = jobs.get(stage.opportunityId);
    if (!job) continue;
    const untilStage = stage.scheduledAt.getTime() - now.getTime();
    const rule: AttentionRule | null =
      untilStage < 0 ? "mark_done" : untilStage <= INTERVIEW_WINDOW_MS ? "interview_soon" : null;
    if (rule === null) continue;
    groups[rule].push({
      key: `${rule}:${stage.id}`,
      rule,
      ...common(job),
      at: stage.scheduledAt,
      stage: { id: stage.id, label: stage.label },
      nextAction: null,
      days: null,
      overdue: false,
      snoozable: isSnoozable(rule),
    });
  }

  for (const job of input.opportunities) {
    if (job.nextAction !== null) {
      if (job.nextActionAt !== null && job.nextActionAt.getTime() < startOfTomorrow.getTime()) {
        groups.next_action_due.push({
          key: `next_action_due:${job.id}`,
          rule: "next_action_due",
          ...common(job),
          at: job.nextActionAt,
          stage: null,
          nextAction: job.nextAction,
          days: null,
          overdue: job.nextActionAt.getTime() < startOfToday.getTime(),
          snoozable: true,
        });
      }
      continue;
    }

    if (job.stageKind === "applied") {
      const since = job.lastEventAt ?? job.stageEnteredAt ?? job.createdAt;
      const days = calendarDaysBetween(since, now, timeZone);
      if (days >= settings.followUpDays) {
        groups.follow_up.push({
          key: `follow_up:${job.id}`,
          rule: "follow_up",
          ...common(job),
          at: since,
          stage: null,
          nextAction: null,
          days,
          overdue: false,
          snoozable: true,
        });
      }
    } else if (job.stageKind === "saved") {
      const since = job.stageEnteredAt ?? job.createdAt;
      const days = calendarDaysBetween(since, now, timeZone);
      if (days >= settings.savedDays) {
        groups.apply_or_drop.push({
          key: `apply_or_drop:${job.id}`,
          rule: "apply_or_drop",
          ...common(job),
          at: since,
          stage: null,
          nextAction: null,
          days,
          overdue: false,
          snoozable: true,
        });
      }
    }
  }

  return ATTENTION_RULES.flatMap((rule) => groups[rule].sort(byTimeThenKey));
}
