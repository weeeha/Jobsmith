"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/auth/session";
import { scopedFor } from "@/lib/db/scoped";
import type { Scoped } from "@/lib/db/scoped";
import { pasteArtifact, type PasteTarget } from "@/lib/artifacts/paste";
import { saveArtifactEdit } from "@/lib/artifacts/edit";
import { markArtifactSent } from "@/lib/artifacts/sent";
import {
  pasteTargetSchema,
  pasteFormSchema,
  editFormSchema,
  type PasteFormState,
  type EditFormState,
} from "@/lib/artifacts/forms";
import { fieldErrorsFromZod } from "@/lib/forms/state";
import { messageFor } from "@/lib/pipeline/messages";
import type { ArtifactScope } from "@/lib/artifacts/values";
import { KEY_PATTERN } from "@/lib/bridge/wire";
import { type Result, fail } from "@/lib/result";

// Shared by every write action in this file: each one revalidates the
// target job's own page and, for a company-scoped change, every other job
// at that company, the same two-step lookup app/(app)/jobs/[slug]/actions.ts's
// own revalidateJob does for a single job.
async function revalidateDocuments(s: Scoped, opportunityId: string, scope: ArtifactScope) {
  const opportunity = await s.opportunity.getById(opportunityId);
  if (!opportunity) return;
  revalidatePath(`/jobs/${opportunity.slug}`);
  if (scope === "company") {
    const slugs = await s.opportunity.listSlugsForCompany(opportunity.companyId);
    for (const slug of slugs) {
      if (slug !== opportunity.slug) revalidatePath(`/jobs/${slug}`);
    }
  }
}

export async function pasteDocumentAction(
  opportunityId: string,
  target: PasteTarget,
  _prev: PasteFormState,
  formData: FormData,
): Promise<PasteFormState> {
  const user = await requireUser();
  const idParsed = z.uuid().safeParse(opportunityId);
  if (!idParsed.success) return { ok: false, code: "not_found", message: messageFor("not_found") };
  const targetParsed = pasteTargetSchema.safeParse(target);
  if (!targetParsed.success) {
    return { ok: false, code: "invalid", message: messageFor("invalid") };
  }
  const fieldsParsed = pasteFormSchema.safeParse({
    title: formData.get("title"),
    kind: formData.get("kind"),
    stageId: formData.get("stageId") ?? "",
    bodyMd: formData.get("bodyMd"),
  });
  if (!fieldsParsed.success) {
    return {
      ok: false,
      code: "invalid",
      message: messageFor("invalid"),
      fieldErrors: fieldErrorsFromZod(fieldsParsed.error),
    };
  }
  const s = scopedFor(user.id);
  const result = await pasteArtifact(s, opportunityId, { target: targetParsed.data, ...fieldsParsed.data });
  if (!result.ok) {
    return { ok: false, code: result.code, message: messageFor(result.code) };
  }
  await revalidateDocuments(s, opportunityId, result.data.scope);
  return { ok: true, data: result.data };
}

export async function saveDocumentEditAction(
  opportunityId: string,
  key: string,
  baseVersion: number,
  _prev: EditFormState,
  formData: FormData,
): Promise<EditFormState> {
  const user = await requireUser();
  const idParsed = z.uuid().safeParse(opportunityId);
  if (!idParsed.success) return { ok: false, code: "not_found", message: messageFor("not_found") };
  if (!KEY_PATTERN.test(key)) {
    return { ok: false, code: "artifact_not_found", message: messageFor("artifact_not_found") };
  }
  const baseVersionParsed = z.number().int().positive().safeParse(baseVersion);
  if (!baseVersionParsed.success) {
    return { ok: false, code: "artifact_not_found", message: messageFor("artifact_not_found") };
  }
  const fieldsParsed = editFormSchema.safeParse({ bodyMd: formData.get("bodyMd") });
  if (!fieldsParsed.success) {
    return {
      ok: false,
      code: "invalid",
      message: messageFor("invalid"),
      fieldErrors: fieldErrorsFromZod(fieldsParsed.error),
    };
  }
  const s = scopedFor(user.id);
  // Documents are never company-scoped (no sendable kind can be shared
  // across a company's jobs), so the ref this action edits is always
  // opportunity scope - there is no separate "which scope" decision to
  // make here the way pasteDocumentAction has to make from its own
  // PasteTarget.
  const result = await saveArtifactEdit(
    s,
    opportunityId,
    { scope: "opportunity", key },
    fieldsParsed.data.bodyMd,
    baseVersionParsed.data,
  );
  if (!result.ok) return { ok: false, code: result.code, message: messageFor(result.code) };
  await revalidateDocuments(s, opportunityId, "opportunity");
  return { ok: true, data: result.data };
}

export async function markDocumentSentAction(
  opportunityId: string,
  key: string,
  version: number,
): Promise<Result<null, string>> {
  const user = await requireUser();
  const idParsed = z.uuid().safeParse(opportunityId);
  if (!idParsed.success) return fail("not_found", messageFor("not_found"));
  if (!KEY_PATTERN.test(key)) return fail("artifact_not_found", messageFor("artifact_not_found"));
  const versionParsed = z.number().int().positive().safeParse(version);
  if (!versionParsed.success) return fail("artifact_not_found", messageFor("artifact_not_found"));
  const s = scopedFor(user.id);
  const result = await markArtifactSent(s, opportunityId, key, versionParsed.data);
  if (!result.ok) return fail(result.code, messageFor(result.code));
  await revalidateDocuments(s, opportunityId, "opportunity");
  return { ok: true, data: null };
}
