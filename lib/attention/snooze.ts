import { z } from "zod";
import type { Scoped } from "@/lib/db/scoped";
import { setNextAction } from "@/lib/pipeline/next-action";
import { DEFAULT_TIME_ZONE } from "@/lib/profile";
import { fail, ok, type Result } from "@/lib/result";
import { addZonedDays, isTimeZone } from "@/lib/time/zone";

export const SNOOZE_OPTIONS = [
  { days: 1, label: "Tomorrow" },
  { days: 3, label: "In 3 days" },
  { days: 7, label: "Next week" },
] as const;
export type SnoozeDays = (typeof SNOOZE_OPTIONS)[number]["days"];
export const SNOOZE_HOUR = 9;

// Interview items have no Snooze: hiding an interview in the next 72 hours is
// never what the user wants (plan D9).
export const SNOOZABLE_KINDS = ["due", "follow_up", "saved", "passed"] as const;
export type SnoozableKind = (typeof SNOOZABLE_KINDS)[number];

export const snoozeInputSchema = z.object({
  opportunityId: z.uuid(),
  kind: z.enum(SNOOZABLE_KINDS),
  days: z.union([z.literal(1), z.literal(3), z.literal(7)]),
  stageId: z.uuid().nullable(),
});
export type SnoozeInput = z.infer<typeof snoozeInputSchema>;

function defaultText(kind: SnoozableKind, stageLabel: string | null): string {
  switch (kind) {
    case "follow_up":
      return "Follow up";
    case "saved":
      return "Apply or drop";
    case "passed":
      return stageLabel ? `Add notes for ${stageLabel}` : "Add notes";
    case "due":
      return "Follow up";
  }
}

/**
 * Snooze sets the job's next action date to 09:00 in the profile time zone,
 * `days` calendar days from now. The text kept is the job's own next action,
 * or the rule's default when it has none.
 */
export async function snoozeItem(
  s: Scoped,
  input: SnoozeInput,
  now: Date,
): Promise<Result<{ at: Date }, "not_found" | "invalid">> {
  const job = await s.opportunity.getById(input.opportunityId);
  if (!job || job.status !== "active") return fail("not_found", "This job no longer exists.");

  const profile = await s.profile.get();
  const timeZone = profile?.timezone && isTimeZone(profile.timezone) ? profile.timezone : DEFAULT_TIME_ZONE;
  let stageLabel: string | null = null;
  if (input.stageId) {
    const stages = await s.stage.listForOpportunity(job.id);
    stageLabel = stages.find((st) => st.id === input.stageId)?.label ?? null;
  }
  const at = addZonedDays(now, input.days, timeZone, SNOOZE_HOUR);
  const result = await setNextAction(s, job.id, { text: job.nextAction ?? defaultText(input.kind, stageLabel), at });
  if (!result.ok) return result;
  return ok({ at });
}
