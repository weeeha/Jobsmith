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
import { createOpportunity } from "@/lib/pipeline/create";
import { createOpportunitySchema } from "@/lib/pipeline/create-schema";
import { placeOpportunity } from "@/lib/pipeline/place";
import { companyNameKey } from "@/lib/companies/name-key";
import { fieldErrorsFromZod, type FormState } from "@/lib/forms/state";

// Every board action concerns exactly one opportunity, which may also be
// open as a job page in another tab, so both routes are revalidated
// (Task 6's action convention). The job's slug is not part of any of these
// actions' own return values, so it is re-read here; a not-found id simply
// yields no second revalidation.
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

function emptyToUndefined(value: FormDataEntryValue | null): string | undefined {
  if (typeof value !== "string" || value.trim() === "") return undefined;
  return value;
}

function toNumberOrUndefined(value: FormDataEntryValue | null): number | undefined {
  if (typeof value !== "string" || value.trim() === "") return undefined;
  const n = Number(value);
  return Number.isNaN(n) ? undefined : n;
}

function isStageKind(value: string): value is StageKind {
  return STAGE_KINDS.some((entry) => entry.kind === value);
}

async function findExistingOpportunity(s: Scoped, companyName: string, roleTitle: string) {
  const company = await s.company.findByNameKey(companyNameKey(companyName));
  if (!company) return null;
  return s.opportunity.findByCompanyAndRole(company.id, roleTitle);
}

export async function createOpportunityAction(prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();
  const raw = {
    companyName: String(formData.get("companyName") ?? ""),
    roleTitle: String(formData.get("roleTitle") ?? ""),
    location: emptyToUndefined(formData.get("location")),
    workMode: emptyToUndefined(formData.get("workMode")),
    sourceUrl: emptyToUndefined(formData.get("sourceUrl")),
    postingText: emptyToUndefined(formData.get("postingText")),
    compMin: toNumberOrUndefined(formData.get("compMin")),
    compMax: toNumberOrUndefined(formData.get("compMax")),
    compCurrency: emptyToUndefined(formData.get("compCurrency")),
    compNote: emptyToUndefined(formData.get("compNote")),
    myAsk: emptyToUndefined(formData.get("myAsk")),
  };

  const parsed = createOpportunitySchema.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      code: "invalid",
      message: messageFor("invalid"),
      fieldErrors: fieldErrorsFromZod(parsed.error),
    };
  }

  const s = scopedFor(user.id);
  const result = await createOpportunity(s, parsed.data);
  if (!result.ok) {
    if (result.code === "duplicate") {
      const existing = await findExistingOpportunity(s, parsed.data.companyName, parsed.data.roleTitle);
      return {
        ok: false,
        code: "duplicate",
        message: messageFor("duplicate"),
        href: existing ? `/jobs/${existing.slug}` : undefined,
      };
    }
    return { ok: false, code: result.code, message: messageFor(result.code) };
  }

  // placeOpportunity (part A, Task 5), not moveOpportunity directly: a job
  // that is already at a later stage was applied to first, so Applied must
  // not end up skipped.
  const whereIsItNow = formData.get("whereIsItNow");
  if (typeof whereIsItNow === "string" && isStageKind(whereIsItNow)) {
    await placeOpportunity(s, result.data.id, whereIsItNow);
  }

  revalidatePath("/board");
  return { ok: true };
}
