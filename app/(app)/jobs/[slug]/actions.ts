"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/auth/session";
import { scopedFor } from "@/lib/db/scoped";
import type { Scoped } from "@/lib/db/scoped";
import { addStage, renameStage, reorderStages, skipStage, unskipStage, removeStage } from "@/lib/pipeline/stages";
import { scheduleStage, setStageOutcome } from "@/lib/pipeline/schedule";
import { setNextAction, setNextActionSchema, completeNextAction } from "@/lib/pipeline/next-action";
import { updateOpportunityDetails, updateOpportunityDetailsSchema } from "@/lib/pipeline/details";
import { opportunityIdSchema, stageIdSchema } from "@/lib/pipeline/action-schemas";
import { messageFor } from "@/lib/pipeline/messages";
import { fieldErrorsFromZod, type FormState } from "@/lib/forms/state";
import { STAGE_FORMATS, type StageFormat } from "@/lib/pipeline/values";
import { fail, type Result } from "@/lib/result";

const ADDABLE_STAGE_KINDS = ["recruiter_screen", "hiring_manager", "portfolio_case", "panel_final"] as const;

// Ruling 1 (Task 10): a blank optional field on the Edit details form
// means "clear this column" - it is sent as `null`, not swallowed into
// `undefined` ("leave unchanged"), so a wrong posting link or pay figure
// can actually be removed, not just replaced. See lib/pipeline/details.ts
// for the matching schema change; roleTitle has no clearing gesture, so it
// is read as a plain (possibly blank, and then rejected) string instead.
function blankToNull(value: FormDataEntryValue | null): string | null {
  if (typeof value !== "string" || value.trim() === "") return null;
  return value;
}

function numberBlankToNull(value: FormDataEntryValue | null): number | null {
  if (typeof value !== "string" || value.trim() === "") return null;
  const n = Number(value);
  return Number.isNaN(n) ? null : n;
}

async function revalidateJob(s: Scoped, opportunityId: string) {
  const opportunity = await s.opportunity.getById(opportunityId);
  revalidatePath("/board");
  if (opportunity) revalidatePath(`/jobs/${opportunity.slug}`);
}

const opportunityAndStageIdSchema = z.object({ opportunityId: opportunityIdSchema, stageId: stageIdSchema });

export async function skipStageAction(opportunityId: string, stageId: string): Promise<Result<null, string>> {
  const user = await requireUser();
  const parsed = opportunityAndStageIdSchema.safeParse({ opportunityId, stageId });
  if (!parsed.success) return fail("not_found", messageFor("not_found"));
  const s = scopedFor(user.id);
  const result = await skipStage(s, opportunityId, stageId);
  if (result.ok) await revalidateJob(s, opportunityId);
  return result;
}

export async function unskipStageAction(opportunityId: string, stageId: string): Promise<Result<null, string>> {
  const user = await requireUser();
  const parsed = opportunityAndStageIdSchema.safeParse({ opportunityId, stageId });
  if (!parsed.success) return fail("not_found", messageFor("not_found"));
  const s = scopedFor(user.id);
  const result = await unskipStage(s, opportunityId, stageId);
  if (result.ok) await revalidateJob(s, opportunityId);
  return result;
}

export async function removeStageAction(opportunityId: string, stageId: string): Promise<Result<null, string>> {
  const user = await requireUser();
  const parsed = opportunityAndStageIdSchema.safeParse({ opportunityId, stageId });
  if (!parsed.success) return fail("not_found", messageFor("not_found"));
  const s = scopedFor(user.id);
  const result = await removeStage(s, opportunityId, stageId);
  if (result.ok) await revalidateJob(s, opportunityId);
  return result;
}

const reorderIdsSchema = z.object({ opportunityId: opportunityIdSchema, orderedIds: z.array(stageIdSchema).min(1) });

export async function reorderStagesAction(opportunityId: string, orderedIds: string[]): Promise<Result<null, string>> {
  const user = await requireUser();
  const parsed = reorderIdsSchema.safeParse({ opportunityId, orderedIds });
  if (!parsed.success) return fail("not_found", messageFor("not_found"));
  const s = scopedFor(user.id);
  const result = await reorderStages(s, opportunityId, orderedIds);
  if (result.ok) await revalidateJob(s, opportunityId);
  return result;
}

export async function completeNextActionAction(opportunityId: string): Promise<Result<null, string>> {
  const user = await requireUser();
  const parsed = opportunityIdSchema.safeParse(opportunityId);
  if (!parsed.success) return fail("not_found", messageFor("not_found"));
  const s = scopedFor(user.id);
  const result = await completeNextAction(s, opportunityId);
  if (result.ok) await revalidateJob(s, opportunityId);
  return result;
}

const renameStageFormSchema = z.object({ label: z.string().trim().min(1) });

export async function renameStageAction(
  opportunityId: string,
  stageId: string,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await requireUser();
  const idsParsed = opportunityAndStageIdSchema.safeParse({ opportunityId, stageId });
  if (!idsParsed.success) return { ok: false, code: "not_found", message: messageFor("not_found") };
  const parsed = renameStageFormSchema.safeParse({ label: formData.get("label") });
  if (!parsed.success) {
    return { ok: false, code: "invalid", message: messageFor("invalid"), fieldErrors: fieldErrorsFromZod(parsed.error) };
  }
  const s = scopedFor(user.id);
  const result = await renameStage(s, opportunityId, stageId, parsed.data.label);
  if (!result.ok) return { ok: false, code: result.code, message: messageFor(result.code) };
  await revalidateJob(s, opportunityId);
  return { ok: true };
}

const addStageFormSchema = z.object({
  kind: z.enum(ADDABLE_STAGE_KINDS),
  label: z.string().trim().min(1),
});

export async function addStageAction(opportunityId: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();
  const idParsed = opportunityIdSchema.safeParse(opportunityId);
  if (!idParsed.success) return { ok: false, code: "not_found", message: messageFor("not_found") };
  const parsed = addStageFormSchema.safeParse({ kind: formData.get("kind"), label: formData.get("label") });
  if (!parsed.success) {
    return { ok: false, code: "invalid", message: messageFor("invalid"), fieldErrors: fieldErrorsFromZod(parsed.error) };
  }
  const s = scopedFor(user.id);
  const result = await addStage(s, opportunityId, parsed.data.kind, parsed.data.label);
  if (!result.ok) return { ok: false, code: result.code, message: messageFor(result.code) };
  await revalidateJob(s, opportunityId);
  return { ok: true };
}

const stageDetailFormSchema = z.object({
  scheduledAt: z.string(),
  format: z.enum([...STAGE_FORMATS, ""]),
  outcomeMd: z.string(),
});

export async function saveStageDetailAction(
  opportunityId: string,
  stageId: string,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await requireUser();
  const idsParsed = opportunityAndStageIdSchema.safeParse({ opportunityId, stageId });
  if (!idsParsed.success) return { ok: false, code: "not_found", message: messageFor("not_found") };
  const parsed = stageDetailFormSchema.safeParse({
    scheduledAt: formData.get("scheduledAt") ?? "",
    format: formData.get("format") ?? "",
    outcomeMd: formData.get("outcomeMd") ?? "",
  });
  if (!parsed.success) {
    return { ok: false, code: "invalid", message: messageFor("invalid"), fieldErrors: fieldErrorsFromZod(parsed.error) };
  }
  let scheduledAt: Date | null = null;
  if (parsed.data.scheduledAt !== "") {
    scheduledAt = new Date(parsed.data.scheduledAt);
    if (Number.isNaN(scheduledAt.getTime())) {
      return {
        ok: false,
        code: "invalid",
        message: messageFor("invalid"),
        fieldErrors: { scheduledAt: "Enter a real date and time." },
      };
    }
  }
  const format: StageFormat | null = parsed.data.format === "" ? null : parsed.data.format;
  const s = scopedFor(user.id);
  const scheduleResult = await scheduleStage(s, opportunityId, stageId, { scheduledAt, format });
  if (!scheduleResult.ok) return { ok: false, code: scheduleResult.code, message: messageFor(scheduleResult.code) };
  const outcomeResult = await setStageOutcome(s, opportunityId, stageId, parsed.data.outcomeMd);
  if (!outcomeResult.ok) return { ok: false, code: outcomeResult.code, message: messageFor(outcomeResult.code) };
  await revalidateJob(s, opportunityId);
  return { ok: true };
}

export async function setNextActionAction(
  opportunityId: string,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await requireUser();
  const idParsed = opportunityIdSchema.safeParse(opportunityId);
  if (!idParsed.success) return { ok: false, code: "not_found", message: messageFor("not_found") };
  const atRaw = String(formData.get("at") ?? "");
  const at = atRaw === "" ? null : new Date(atRaw);
  if (at !== null && Number.isNaN(at.getTime())) {
    return { ok: false, code: "invalid", message: messageFor("invalid"), fieldErrors: { at: "Enter a real date and time." } };
  }
  const parsed = setNextActionSchema.safeParse({ text: formData.get("text"), at });
  if (!parsed.success) {
    return { ok: false, code: "invalid", message: messageFor("invalid"), fieldErrors: fieldErrorsFromZod(parsed.error) };
  }
  const s = scopedFor(user.id);
  const result = await setNextAction(s, opportunityId, parsed.data);
  if (!result.ok) return { ok: false, code: result.code, message: messageFor(result.code) };
  await revalidateJob(s, opportunityId);
  return { ok: true };
}

export async function updateOpportunityDetailsAction(
  opportunityId: string,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await requireUser();
  const idParsed = opportunityIdSchema.safeParse(opportunityId);
  if (!idParsed.success) return { ok: false, code: "not_found", message: messageFor("not_found") };
  const raw = {
    // roleTitle has no clearing gesture in the UI (unlike every field
    // below): a blank submission must fail updateOpportunityDetailsSchema's
    // `.min(1)`, not silently become "leave unchanged" or "clear it" - the
    // column is NOT NULL.
    roleTitle: String(formData.get("roleTitle") ?? ""),
    location: blankToNull(formData.get("location")),
    workMode: blankToNull(formData.get("workMode")),
    sourceUrl: blankToNull(formData.get("sourceUrl")),
    compMin: numberBlankToNull(formData.get("compMin")),
    compMax: numberBlankToNull(formData.get("compMax")),
    compCurrency: blankToNull(formData.get("compCurrency")),
    compNote: blankToNull(formData.get("compNote")),
    myAsk: blankToNull(formData.get("myAsk")),
  };
  const parsed = updateOpportunityDetailsSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, code: "invalid", message: messageFor("invalid"), fieldErrors: fieldErrorsFromZod(parsed.error) };
  }
  const s = scopedFor(user.id);
  const result = await updateOpportunityDetails(s, opportunityId, parsed.data);
  if (!result.ok) return { ok: false, code: result.code, message: messageFor(result.code) };
  await revalidateJob(s, opportunityId);
  return { ok: true };
}
