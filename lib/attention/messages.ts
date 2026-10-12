import type { AttentionItem } from "@/lib/attention";
import type { SnoozePreset } from "@/lib/attention/snooze";

// Home's copy, as plain functions so the component only lays it out. A reason
// that names a time comes back in three parts so the page can put a
// <LocalTime> between them.
export type ReasonParts = { before: string; time: Date | null; after: string };

function dayCount(days: number | null): string {
  return days === 1 ? "1 day" : `${days ?? 0} days`;
}

export function attentionReason(item: AttentionItem): ReasonParts {
  switch (item.rule) {
    case "interview_soon":
      return { before: `${item.stage?.label ?? "Interview"}, `, time: item.at, after: "" };
    case "next_action_due":
      return {
        before: item.overdue ? `${item.nextAction ?? ""}. Overdue since ` : `${item.nextAction ?? ""}. Due `,
        time: item.at,
        after: ".",
      };
    case "follow_up":
      return { before: `Follow up? No news for ${dayCount(item.days)}.`, time: null, after: "" };
    case "apply_or_drop":
      return { before: `Apply or drop. Saved ${dayCount(item.days)} ago.`, time: null, after: "" };
    case "mark_done":
      return {
        before: `${item.stage?.label ?? "Interview"} was `,
        time: item.at,
        after: ". Mark it done and add notes.",
      };
  }
}

export type PrimaryAction =
  | { kind: "link"; label: string; ariaLabel: string; href: string }
  | { kind: "done"; label: string; ariaLabel: string };

export function primaryAction(item: AttentionItem): PrimaryAction {
  const subject = `${item.roleTitle} at ${item.companyName}`;
  switch (item.rule) {
    case "interview_soon":
      return { kind: "link", label: "Open prep", ariaLabel: `Open prep for ${subject}`, href: `/jobs/${item.slug}?tab=prep` };
    case "next_action_due":
      return { kind: "done", label: "Done", ariaLabel: `Mark the next action done for ${subject}` };
    default:
      return { kind: "link", label: "Open job", ariaLabel: `Open ${subject}`, href: `/jobs/${item.slug}` };
  }
}

export const SNOOZE_LABELS: Record<SnoozePreset, string> = {
  tomorrow: "Until tomorrow",
  in_3_days: "For 3 days",
  next_week: "For a week",
};

export function snoozeAriaLabel(item: Pick<AttentionItem, "roleTitle" | "companyName">): string {
  return `Snooze ${item.roleTitle} at ${item.companyName}`;
}

export function snoozedAnnouncement(item: Pick<AttentionItem, "roleTitle" | "companyName">): string {
  return `Snoozed ${item.roleTitle} at ${item.companyName}.`;
}

export function doneAnnouncement(item: Pick<AttentionItem, "roleTitle" | "companyName">): string {
  return `Marked the next action done for ${item.roleTitle} at ${item.companyName}.`;
}

export function snoozeFailure(item: Pick<AttentionItem, "roleTitle" | "companyName">, message: string): string {
  return `Could not snooze ${item.roleTitle} at ${item.companyName}. ${message}`;
}

export function doneFailure(message: string): string {
  return `Could not mark the next action done. ${message}`;
}

export function documentsLabel(count: number): string {
  return count === 1 ? "1 document" : `${count} documents`;
}

export const HOME_MESSAGES = {
  noJobsTitle: "No jobs yet.",
  noJobsDescription: "Add a job on the board and Home starts telling you what to do next.",
  noJobsAction: "Go to the board",
  nothingTitle: "Nothing needs attention today.",
  nothingDescription: "Interviews, due next actions and jobs that sat too long show up here.",
  openBoard: "Open the board",
  noPushes: "No pushes yet. Documents pushed from the command line show up here.",
} as const;
