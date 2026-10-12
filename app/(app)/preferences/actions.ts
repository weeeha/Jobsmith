"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth/session";
import { scopedFor } from "@/lib/db/scoped";
import { logDbErrorSafely } from "@/lib/log/db-error";
import { testPosting, testPostingFormSchema, type TestPostingResult } from "@/lib/fit/test-posting";
import { fieldErrorsByPath, fieldErrorsFromZod, type FormState } from "@/lib/forms/state";
import { intakeDeps } from "@/lib/intake/deps";
import { readAddJobForm } from "@/lib/intake/form";
import { NEEDS_TEXT_MESSAGES } from "@/lib/intake/messages";
import { readPreferencesForm } from "@/lib/preferences/form";
import { preferencesSchema } from "@/lib/preferences/schema";
import { messageFor } from "@/lib/pipeline/messages";
import { loadProfile, savePreferences } from "@/lib/profile/store";

export async function savePreferencesAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();
  const parsed = preferencesSchema.safeParse(readPreferencesForm(formData));
  if (!parsed.success) {
    return { ok: false, code: "invalid", message: messageFor("invalid"), fieldErrors: fieldErrorsByPath(parsed.error) };
  }
  try {
    await savePreferences(scopedFor(user.id), parsed.data);
  } catch (error) {
    // The thrown error carries every preference value; the form keeps what
    // the user typed and shows the message instead of the error page.
    logDbErrorSafely("[preferences]", {}, error);
    return { ok: false, code: "server_error", message: messageFor("server_error") };
  }
  // Hard filters show on every job page and in the bridge context, and the
  // Home reminder days change what Home lists, so the whole app re-renders.
  revalidatePath("/", "layout");
  return { ok: true };
}

export type TestPostingState =
  | undefined
  | { ok: true; data: TestPostingResult }
  | {
      ok: false;
      code: "invalid" | "needs_text" | "server_error";
      message: string;
      fieldErrors?: Record<string, string>;
    };

// Reads, checks and scores one posting against the saved preferences and
// resume, and writes nothing.
export async function testPostingAction(_prev: TestPostingState, formData: FormData): Promise<TestPostingState> {
  const user = await requireUser();
  const form = readAddJobForm(formData);
  const parsed = testPostingFormSchema.safeParse({ sourceUrl: form.sourceUrl, postingText: form.postingText });
  if (!parsed.success) {
    return { ok: false, code: "invalid", message: messageFor("invalid"), fieldErrors: fieldErrorsFromZod(parsed.error) };
  }
  try {
    const profile = await loadProfile(scopedFor(user.id));
    const outcome = await testPosting(
      { url: parsed.data.sourceUrl, text: parsed.data.postingText },
      { userId: user.id, profile },
      intakeDeps(),
    );
    if (outcome.kind === "needs_text") {
      return { ok: false, code: "needs_text", message: NEEDS_TEXT_MESSAGES[outcome.reason] };
    }
    return { ok: true, data: outcome.result };
  } catch (error) {
    logDbErrorSafely("[fit]", {}, error);
    return { ok: false, code: "server_error", message: messageFor("unexpected") };
  }
}
