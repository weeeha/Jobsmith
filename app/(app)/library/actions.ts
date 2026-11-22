"use server";

import { z } from "zod";

import { requireUser } from "@/lib/auth/session";
import { scopedFor } from "@/lib/db/scoped";
import { fieldErrorsFromZod, type FormStateWith } from "@/lib/forms/state";
import { archiveLibraryItem, getLibraryItem, libraryItemInputSchema, updateLibraryItem } from "@/lib/library/items";
import { messageFor } from "@/lib/pipeline/messages";
import { fail, ok, type Result } from "@/lib/result";

const GONE = "This item no longer exists.";

// The client calls router.refresh() after a write, so none of these revalidate.

export async function updateLibraryItemAction(
  id: string,
  _prev: FormStateWith<{ id: string }>,
  formData: FormData,
): Promise<FormStateWith<{ id: string }>> {
  const user = await requireUser();
  const idParsed = z.uuid().safeParse(id);
  if (!idParsed.success) return { ok: false, code: "not_found", message: GONE };
  const s = scopedFor(user.id);
  // The kind is fixed when an item is made; an edit never changes it.
  const existing = await getLibraryItem(s, id);
  if (!existing) return { ok: false, code: "not_found", message: GONE };

  const input = {
    kind: existing.kind,
    title: formData.get("title") ?? "",
    bodyMd: formData.get("bodyMd") ?? "",
    tags: formData.getAll("tags").filter((v): v is string => typeof v === "string"),
  };
  const parsed = libraryItemInputSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, code: "invalid", message: messageFor("invalid"), fieldErrors: fieldErrorsFromZod(parsed.error) };
  }
  const result = await updateLibraryItem(s, id, parsed.data);
  if (!result.ok) return { ok: false, code: result.code, message: result.message };
  return { ok: true, data: { id } };
}

export async function archiveLibraryItemAction(
  id: string,
  archived: boolean,
): Promise<Result<{ archived: boolean }, string>> {
  const user = await requireUser();
  const idParsed = z.uuid().safeParse(id);
  if (!idParsed.success) return fail("not_found", GONE);
  const result = await archiveLibraryItem(scopedFor(user.id), id, archived === true);
  if (!result.ok) return result;
  return ok({ archived: result.data.archivedAt !== null });
}
