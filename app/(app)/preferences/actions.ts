"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth/session";
import { scopedFor } from "@/lib/db/scoped";
import { preferencesFromForm } from "@/lib/preferences/form";
import { preferencesInputSchema } from "@/lib/preferences/schema";
import { savePreferences } from "@/lib/preferences/save";
import { messageFor } from "@/lib/pipeline/messages";
import { fieldErrorsFromZod, type FormState } from "@/lib/forms/state";
import { loadFitProfile } from "@/lib/fit/profile";
import { logFitError } from "@/lib/fit/log";
import { testPosting, testPostingFormSchema, type TestPostingState } from "@/lib/fit/test-posting";
import { intakeDeps } from "@/lib/intake/deps";
import { NEEDS_TEXT_MESSAGES, POSTING_TEXT_HINT } from "@/lib/intake/messages";

export async function savePreferencesAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();
  const parsed = preferencesInputSchema.safeParse(preferencesFromForm(formData));
  if (!parsed.success) {
    return { ok: false, code: "invalid", message: messageFor("invalid"), fieldErrors: fieldErrorsFromZod(parsed.error) };
  }
  await savePreferences(scopedFor(user.id), parsed.data);
  // Home reads the reminder days, and the board and every job page read the
  // hard filters and the score threshold.
  revalidatePath("/", "layout");
  return { ok: true };
}

function textOf(formData: FormData, name: string): string | undefined {
  const value = formData.get(name);
  return typeof value === "string" && value.trim() !== "" ? value : undefined;
}

// Reads one posting and scores it against the saved preferences and resume.
// It writes nothing, so it revalidates nothing.
export async function testPostingAction(_prev: TestPostingState, formData: FormData): Promise<TestPostingState> {
  const user = await requireUser();
  const parsed = testPostingFormSchema.safeParse({
    sourceUrl: textOf(formData, "sourceUrl"),
    postingText: textOf(formData, "postingText"),
  });
  if (!parsed.success) {
    return { ok: false, code: "invalid", message: messageFor("invalid"), fieldErrors: fieldErrorsFromZod(parsed.error) };
  }
  try {
    const s = scopedFor(user.id);
    const profile = await loadFitProfile(s);
    const outcome = await testPosting(
      { url: parsed.data.sourceUrl, text: parsed.data.postingText },
      { userId: user.id, profile },
      intakeDeps(),
    );
    if (outcome.kind === "needs_text") {
      return {
        ok: false,
        code: "needs_text",
        message: NEEDS_TEXT_MESSAGES[outcome.reason],
        fieldErrors: { postingText: POSTING_TEXT_HINT },
      };
    }
    return { ok: true, result: outcome.result };
  } catch (error) {
    logFitError(null, error);
    return { ok: false, code: "server_error", message: "Something went wrong. Try again." };
  }
}
