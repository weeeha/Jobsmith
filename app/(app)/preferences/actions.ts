"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth/session";
import { scopedFor } from "@/lib/db/scoped";
import { preferencesFromForm } from "@/lib/preferences/form";
import { preferencesInputSchema } from "@/lib/preferences/schema";
import { savePreferences } from "@/lib/preferences/save";
import { messageFor } from "@/lib/pipeline/messages";
import { fieldErrorsFromZod, type FormState } from "@/lib/forms/state";

export async function savePreferencesAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();
  const parsed = preferencesInputSchema.safeParse(preferencesFromForm(formData));
  if (!parsed.success) {
    return { ok: false, code: "invalid", message: messageFor("invalid"), fieldErrors: fieldErrorsFromZod(parsed.error) };
  }
  await savePreferences(scopedFor(user.id), parsed.data);
  revalidatePath("/preferences");
  // Home reads the follow-up and saved-days settings.
  revalidatePath("/");
  return { ok: true };
}
