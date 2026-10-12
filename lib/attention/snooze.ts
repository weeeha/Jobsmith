import { atTimeDaysLater } from "@/lib/time/zone";

export const SNOOZE_PRESETS = ["tomorrow", "in_3_days", "next_week"] as const;
export type SnoozePreset = (typeof SNOOZE_PRESETS)[number];
export const SNOOZE_DAYS: Record<SnoozePreset, number> = { tomorrow: 1, in_3_days: 3, next_week: 7 };
export const SNOOZE_HOUR = 9;

// A snoozed follow-up or apply-or-drop item has no next action to push back,
// so snoozing gives it one with this text.
export const SNOOZE_FALLBACK_TEXT: Record<"follow_up" | "apply_or_drop", string> = {
  follow_up: "Follow up",
  apply_or_drop: "Apply or drop",
};

// 09:00 in the profile zone, that many calendar days after today's date there.
export function snoozeUntil(preset: SnoozePreset, now: Date, timeZone: string): Date {
  return atTimeDaysLater(now, timeZone, SNOOZE_DAYS[preset], SNOOZE_HOUR, 0);
}
