"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { requireUser } from "@/lib/auth/session";
import { scopedFor } from "@/lib/db/scoped";
import { SNOOZABLE_RULES, type SnoozableRule } from "@/lib/attention";
import { SNOOZE_FALLBACK_TEXT, SNOOZE_PRESETS, snoozeUntil, type SnoozePreset } from "@/lib/attention/snooze";
import { snoozeNextAction } from "@/lib/pipeline/next-action";
import { opportunityIdSchema } from "@/lib/pipeline/action-schemas";
import { messageFor } from "@/lib/pipeline/messages";
import { loadProfile } from "@/lib/profile/store";
import { fail, type Result } from "@/lib/result";

export async function logout() {
  await auth.api.signOut({ headers: await headers() });
  redirect("/login");
}

const snoozeInputSchema = z.object({
  opportunityId: opportunityIdSchema,
  rule: z.enum(SNOOZABLE_RULES),
  preset: z.enum(SNOOZE_PRESETS),
});

/**
 * Pushes a job's next action to 09:00 in the profile zone, a few calendar days
 * ahead. Home offers it on due next actions, follow-ups and apply-or-drop
 * items only; an interview's time is fixed.
 */
export async function snoozeAction(
  opportunityId: string,
  rule: SnoozableRule,
  preset: SnoozePreset,
): Promise<Result<null, "not_found" | "closed" | "invalid">> {
  const user = await requireUser();
  const parsed = snoozeInputSchema.safeParse({ opportunityId, rule, preset });
  if (!parsed.success) return fail("invalid", messageFor("invalid"));

  const s = scopedFor(user.id);
  const profile = await loadProfile(s);
  // A due next action always has text, so this fallback is never used for it.
  const fallbackText =
    parsed.data.rule === "next_action_due" ? SNOOZE_FALLBACK_TEXT.follow_up : SNOOZE_FALLBACK_TEXT[parsed.data.rule];
  const result = await snoozeNextAction(s, parsed.data.opportunityId, {
    until: snoozeUntil(parsed.data.preset, new Date(), profile.timezone),
    fallbackText,
  });
  if (!result.ok) return fail(result.code, messageFor(result.code));

  const job = await s.opportunity.getById(parsed.data.opportunityId);
  revalidatePath("/");
  revalidatePath("/board");
  if (job) revalidatePath(`/jobs/${job.slug}`);
  return result;
}
