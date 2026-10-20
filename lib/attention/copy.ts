import type { StageFormat } from "@/lib/pipeline/values";
import { STAGE_FORMAT_LABELS } from "@/lib/pipeline/labels";
import type { AttentionItem, AttentionKind } from "./items";

// Home's binding copy (plan, Copy section), kept pure and client-safe so the
// list components and their tests read the same strings. Dates cannot be
// formatted here: they must render through LocalTime in the browser's zone, so
// a meta line comes back as text around one time slot.

export const GROUP_TITLES: Record<AttentionKind, string> = {
  interview: "Interviews in the next 72 hours",
  due: "Due today or overdue",
  follow_up: "Follow up?",
  saved: "Apply or drop",
  passed: "Mark it done and add notes",
};

export function homeSubline(count: number): string | null {
  if (count === 0) return null;
  return count === 1 ? "1 thing needs you today." : `${count} things need you today.`;
}

export const EMPTY_COPY = {
  title: "Nothing needs you today.",
  description: "Interviews, due next actions and jobs that went quiet show up here.",
  action: "Open the board",
} as const;

export const SIDE_COPY = {
  pipeline: "Pipeline",
  pushes: "Recent pushes",
  noPushes: "No documents pushed yet.",
} as const;

export type MetaLine = {
  prefix: string;
  time: { at: Date; mode: "date" | "datetime" } | null;
  suffix: string;
};

export type ItemCopy = {
  reason: string;
  jobLine: string;
  meta: MetaLine;
};

function formatLabel(format: StageFormat | null): string {
  return format ? STAGE_FORMAT_LABELS[format] : "";
}

export function itemCopy(item: AttentionItem): ItemCopy {
  const jobLine = `${item.job.roleTitle} at ${item.job.companyName}`;
  switch (item.kind) {
    case "interview": {
      const format = formatLabel(item.stage.format);
      const suffix = [format, item.researched ? "" : "No research yet"].filter(Boolean).map((part) => ` · ${part}`).join("");
      return {
        reason: item.stage.label,
        jobLine,
        meta: { prefix: "", time: { at: item.stage.scheduledAt, mode: "datetime" }, suffix },
      };
    }
    case "due":
      return {
        reason: item.nextAction,
        jobLine,
        meta: { prefix: item.overdue ? "Overdue · " : "Due today · ", time: { at: item.at, mode: "datetime" }, suffix: "" },
      };
    case "follow_up":
      return {
        reason: `Nothing new for ${item.quietDays} ${item.quietDays === 1 ? "day" : "days"}`,
        jobLine,
        meta: item.appliedAt
          ? { prefix: "In Applied since ", time: { at: item.appliedAt, mode: "date" }, suffix: ". No next action set." }
          : { prefix: "In Applied. No next action set.", time: null, suffix: "" },
      };
    case "saved":
      return {
        reason: `In Saved for ${item.days} ${item.days === 1 ? "day" : "days"}`,
        jobLine,
        meta: { prefix: "Saved ", time: { at: item.savedAt, mode: "date" }, suffix: "." },
      };
    case "passed":
      return {
        reason: item.stage.label,
        jobLine,
        meta: { prefix: "Was ", time: { at: item.stage.scheduledAt, mode: "datetime" }, suffix: ". Still marked as scheduled." },
      };
  }
}

/** The primary action per kind (plan D10). Links go to the job, the rest write. */
export type PrimaryAction =
  | { type: "link"; label: string; href: string }
  | { type: "mark_done"; label: string }
  | { type: "mark_applied"; label: string };

export function primaryAction(item: AttentionItem): PrimaryAction {
  const job = `/jobs/${item.job.slug}`;
  switch (item.kind) {
    case "interview":
      // Prep is built on the research, so an unresearched interview starts there.
      return item.researched
        ? { type: "link", label: "Open prep", href: `${job}?tab=prep` }
        : { type: "link", label: "Open research", href: `${job}?tab=research` };
    case "due":
      return { type: "mark_done", label: "Mark done" };
    case "follow_up":
      return { type: "link", label: "Set next action", href: job };
    case "saved":
      return { type: "mark_applied", label: "Mark applied" };
    case "passed":
      return { type: "link", label: "Add notes", href: job };
  }
}

/** "Snoozed to Fri 16 Oct." in the browser's own locale and zone. */
export function snoozedMessage(at: Date | string): string {
  const parts = new Intl.DateTimeFormat(undefined, { weekday: "short", day: "numeric", month: "short" }).formatToParts(
    typeof at === "string" ? new Date(at) : at,
  );
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return `Snoozed to ${get("weekday")} ${get("day")} ${get("month")}.`;
}

export const ANNOUNCE = { done: "Marked done.", applied: "Moved to Applied." } as const;
export const FAILURE_MESSAGE = "Something went wrong. Try again.";
