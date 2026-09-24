"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/auth/session";
import { scopedFor } from "@/lib/db/scoped";
import type { Scoped } from "@/lib/db/scoped";
import { pasteArtifact, type PasteTarget } from "@/lib/artifacts/paste";
import { pasteTargetSchema, pasteFormSchema, type PasteFormState } from "@/lib/artifacts/forms";
import { fieldErrorsFromZod } from "@/lib/forms/state";
import { messageFor } from "@/lib/pipeline/messages";
import type { ArtifactScope } from "@/lib/artifacts/values";

// Shared by every write action in this file: each one revalidates the
// target job's own page and, for a company-scoped change, every other job
// at that company, the same two-step lookup app/(app)/jobs/[slug]/actions.ts's
// own revalidateJob does for a single job.
export async function revalidateDocuments(s: Scoped, opportunityId: string, scope: ArtifactScope) {
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
