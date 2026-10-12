"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth/session";
import { scopedFor } from "@/lib/db/scoped";
import { fieldErrorsByPath, type FormState } from "@/lib/forms/state";
import { readPreferencesForm } from "@/lib/preferences/form";
import { preferencesSchema } from "@/lib/preferences/schema";
import { messageFor } from "@/lib/pipeline/messages";
import { savePreferences } from "@/lib/profile/store";

export async function savePreferencesAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();
  const parsed = preferencesSchema.safeParse(readPreferencesForm(formData));
  if (!parsed.success) {
    return { ok: false, code: "invalid", message: messageFor("invalid"), fieldErrors: fieldErrorsByPath(parsed.error) };
  }
  await savePreferences(scopedFor(user.id), parsed.data);
  // Hard filters show on every job page and in the bridge context, and the
  // Home reminder days change what Home lists, so the whole app re-renders.
  revalidatePath("/", "layout");
  return { ok: true };
}
