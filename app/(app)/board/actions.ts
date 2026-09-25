"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth/session";
import { scopedFor, type Scoped } from "@/lib/db/scoped";
import { moveOpportunity } from "@/lib/pipeline/move";
import { closeOpportunity, reopenOpportunity } from "@/lib/pipeline/close";
import { STAGE_KINDS, type StageKind } from "@/lib/pipeline/kinds";
import type { MoveTarget, MoveError } from "@/lib/pipeline/rules";
import type { ClosedReason } from "@/lib/pipeline/values";
import { fail, type Result } from "@/lib/result";
import { messageFor } from "@/lib/pipeline/messages";
import { opportunityIdSchema, moveTargetSchema, closedReasonSchema } from "@/lib/pipeline/action-schemas";
import { placeOpportunity } from "@/lib/pipeline/place";
import { fieldErrorsFromZod } from "@/lib/forms/state";
import { addJob } from "@/lib/intake/add-job";
import { readAddJobForm, addJobFormSchema, encodeDraft } from "@/lib/intake/form";
import { intakeDeps } from "@/lib/intake/deps";
import { logIntakeError } from "@/lib/intake/log";
import type { AddJobState } from "@/lib/intake/state";
import { NEEDS_TEXT_MESSAGES, NEEDS_DETAILS_MESSAGES, DUPLICATE_MESSAGE, POSTING_TEXT_HINT } from "@/lib/intake/messages";

// Every board action concerns exactly one opportunity, which may also be
// open as a job page in another tab, so both routes are revalidated. The
// job's slug is not part of any of these actions' own return values, so it
// is re-read here; a not-found id simply yields no second revalidation.
async function revalidateBoardAndJob(s: Scoped, opportunityId: string) {
  revalidatePath("/board");
  const opportunity = await s.opportunity.getById(opportunityId);
  if (opportunity) revalidatePath(`/jobs/${opportunity.slug}`);
}

export async function moveAction(
  opportunityId: string,
  target: MoveTarget,
): Promise<
  Result<
    { from: { kind: StageKind; label: string }; to: { stageId: string; kind: StageKind; label: string } },
    MoveError
  >
> {
  const user = await requireUser();
  const idParsed = opportunityIdSchema.safeParse(opportunityId);
  const targetParsed = moveTargetSchema.safeParse(target);
  if (!idParsed.success || !targetParsed.success) {
    return fail("not_found", messageFor("not_found"));
  }
  const s = scopedFor(user.id);
  const result = await moveOpportunity(s, idParsed.data, targetParsed.data);
  await revalidateBoardAndJob(s, idParsed.data);
  return result;
}

export async function closeAction(
  opportunityId: string,
  reason: ClosedReason,
): Promise<Result<null, "not_found" | "closed">> {
  const user = await requireUser();
  const idParsed = opportunityIdSchema.safeParse(opportunityId);
  const reasonParsed = closedReasonSchema.safeParse(reason);
  if (!idParsed.success || !reasonParsed.success) {
    return fail("not_found", messageFor("not_found"));
  }
  const s = scopedFor(user.id);
  const result = await closeOpportunity(s, idParsed.data, reasonParsed.data);
  await revalidateBoardAndJob(s, idParsed.data);
  return result;
}

export async function reopenAction(opportunityId: string): Promise<Result<null, "not_found" | "not_closed">> {
  const user = await requireUser();
  const idParsed = opportunityIdSchema.safeParse(opportunityId);
  if (!idParsed.success) {
    return fail("not_found", messageFor("not_found"));
  }
  const s = scopedFor(user.id);
  const result = await reopenOpportunity(s, idParsed.data);
  await revalidateBoardAndJob(s, idParsed.data);
  return result;
}

function isStageKind(value: string): value is StageKind {
  return STAGE_KINDS.some((entry) => entry.kind === value);
}

export async function addJobAction(_prev: AddJobState, formData: FormData): Promise<AddJobState> {
  const user = await requireUser();
  const raw = readAddJobForm(formData);
  const parsed = addJobFormSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, code: "invalid", message: messageFor("invalid"), fieldErrors: fieldErrorsFromZod(parsed.error) };
  }

  const s = scopedFor(user.id);

  // intakeDeps() runs inside the same try/catch as addJob itself: a
  // thrown dependency (or any other unexpected error deep in resolution or
  // creation) must never replace the board with the error boundary, only
  // ever fail this one action.
  const requestId = crypto.randomUUID();
  let result;
  try {
    result = await addJob(s, user.id, parsed.data, intakeDeps());
  } catch (error) {
    logIntakeError(requestId, error);
    return { ok: false, code: "server_error", message: "Something went wrong. Try again." };
  }

  if (result.kind === "invalid") {
    return { ok: false, code: "invalid", message: result.message ?? messageFor("invalid"), fieldErrors: result.fieldErrors };
  }
  if (result.kind === "needs_text") {
    return {
      ok: false,
      code: "needs_text",
      message: NEEDS_TEXT_MESSAGES[result.reason],
      fieldErrors: { postingText: POSTING_TEXT_HINT },
    };
  }
  if (result.kind === "needs_details") {
    const fieldErrors: Record<string, string> = {};
    for (const field of result.missing) {
      fieldErrors[field] = field === "companyName" ? "Enter a company name." : "Enter a role.";
    }
    return {
      ok: false,
      code: "needs_details",
      message: NEEDS_DETAILS_MESSAGES[result.reason],
      fieldErrors,
      draft: encodeDraft(result.draft),
    };
  }
  if (result.kind === "duplicate") {
    return {
      ok: false,
      code: "duplicate",
      message: DUPLICATE_MESSAGE,
      href: result.existingSlug ? `/jobs/${result.existingSlug}` : undefined,
      draft: result.draft ? encodeDraft(result.draft) : undefined,
    };
  }

  // added: placeOpportunity, not moveOpportunity directly, unchanged from
  // createOpportunityAction - a job that is already at a later stage
  // was applied to first, so Applied must not end up skipped.
  const whereIsItNow = formData.get("whereIsItNow");
  let placement: Result<null, MoveError> | undefined;
  if (typeof whereIsItNow === "string" && isStageKind(whereIsItNow)) {
    placement = await placeOpportunity(s, result.id, whereIsItNow);
  }

  revalidatePath("/board");
  if (placement && !placement.ok) {
    return { ok: false, code: placement.code, message: messageFor(placement.code) };
  }

  return { ok: true, data: { slug: result.slug, roleTitle: result.roleTitle, companyName: result.companyName, note: result.note } };
}
