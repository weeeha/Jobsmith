"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/auth/session";
import { scopedFor } from "@/lib/db/scoped";
import { createApiToken, revokeApiToken, tokenNameSchema, type TokenFormState } from "@/lib/auth/api-token";
import { messageFor } from "@/lib/pipeline/messages";
import { fieldErrorsByPath, type FormState } from "@/lib/forms/state";
import { profileFormSchema, readProfileForm } from "@/lib/profile/schema";
import { saveProfile } from "@/lib/profile/store";
import { logDbErrorSafely } from "@/lib/log/db-error";
import { fail, type Result } from "@/lib/result";

export async function createTokenAction(_prev: TokenFormState, formData: FormData): Promise<TokenFormState> {
  const user = await requireUser();
  const parsed = tokenNameSchema.safeParse(formData.get("name"));
  if (!parsed.success) {
    const message = parsed.error.issues[0]?.message ?? messageFor("invalid");
    return { ok: false, code: "invalid", message: messageFor("invalid"), fieldErrors: { name: message } };
  }
  const s = scopedFor(user.id);
  const result = await createApiToken(s, parsed.data);
  if (!result.ok) {
    return { ok: false, code: result.code, message: messageFor(result.code) };
  }
  revalidatePath("/settings");
  return { ok: true, data: { token: result.data.token, name: result.data.item.name } };
}

export async function revokeTokenAction(tokenId: string): Promise<Result<null, string>> {
  const user = await requireUser();
  const parsedId = z.uuid().safeParse(tokenId);
  if (!parsedId.success) return fail("token_not_found", messageFor("token_not_found"));
  const s = scopedFor(user.id);
  const result = await revokeApiToken(s, tokenId);
  if (!result.ok) return fail(result.code, messageFor(result.code));
  revalidatePath("/settings");
  return { ok: true, data: null };
}

export async function saveProfileAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();
  const parsed = profileFormSchema.safeParse(readProfileForm(formData));
  if (!parsed.success) {
    return { ok: false, code: "invalid", message: messageFor("invalid"), fieldErrors: fieldErrorsByPath(parsed.error) };
  }
  try {
    await saveProfile(scopedFor(user.id), parsed.data);
  } catch (error) {
    // The thrown error carries the resume and headline; the form keeps what
    // the user typed and shows the message instead of the error page.
    logDbErrorSafely("[profile]", {}, error);
    return { ok: false, code: "server_error", message: messageFor("server_error") };
  }
  // The zone shows in every page's times and the preferences in every job's
  // hard-filter line, so the whole app re-renders.
  revalidatePath("/", "layout");
  return { ok: true };
}
