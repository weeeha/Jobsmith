"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/auth/session";
import { scopedFor } from "@/lib/db/scoped";
import { createApiToken, revokeApiToken, tokenNameSchema, type TokenFormState } from "@/lib/auth/api-token";
import { messageFor } from "@/lib/pipeline/messages";
import { fail, type Result } from "@/lib/result";
import { profileFromForm, profileInputSchema, saveProfile } from "@/lib/profile";
import { fieldErrorsFromZod, type FormState } from "@/lib/forms/state";
import { audioDeps } from "@/lib/audio/deps";
import { deleteAllAudio } from "@/lib/audio/segments";
import { prepSettingsInputSchema, savePrepSettings } from "@/lib/prep/settings";
import { loadVoiceOptions } from "@/lib/prep/voices";
import type { Voice } from "@/lib/tts/driver";

export async function saveProfileAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();
  const parsed = profileInputSchema.safeParse(profileFromForm(formData));
  if (!parsed.success) {
    return { ok: false, code: "invalid", message: messageFor("invalid"), fieldErrors: fieldErrorsFromZod(parsed.error) };
  }
  await saveProfile(scopedFor(user.id), parsed.data);
  revalidatePath("/settings");
  // Home's "due today" depends on the time zone.
  revalidatePath("/");
  return { ok: true };
}

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

function text(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === "string" ? value : "";
}

// A blank or unreadable box reads as NaN, which the schema rejects with its own message.
function figure(formData: FormData, key: string): number {
  const raw = text(formData, key).trim();
  return raw === "" ? Number.NaN : Number(raw);
}

export async function savePrepSettingsAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();
  const parsed = prepSettingsInputSchema.safeParse({
    voices: { interviewer: text(formData, "interviewerVoice"), candidate: text(formData, "candidateVoice") },
    speed: figure(formData, "speed"),
    gapFactor: figure(formData, "gapFactor"),
    browserVoices: { interviewer: text(formData, "browserInterviewer"), candidate: text(formData, "browserCandidate") },
  });
  if (!parsed.success) {
    return { ok: false, code: "invalid", message: messageFor("invalid"), fieldErrors: fieldErrorsFromZod(parsed.error) };
  }
  await savePrepSettings(scopedFor(user.id), parsed.data);
  revalidatePath("/settings");
  return { ok: true };
}

/** Every clip, asset and stored object of the caller, across all jobs. */
export async function deleteAllAudioAction(): Promise<Result<{ deleted: number }, string>> {
  const user = await requireUser();
  const deleted = await deleteAllAudio(scopedFor(user.id), audioDeps());
  revalidatePath("/settings");
  return { ok: true, data: { deleted } };
}

/** The provider's voice list, fetched when the Voice section asks for it and never while a page renders. */
export async function loadVoicesAction(): Promise<Result<Voice[], string>> {
  await requireUser();
  const driver = audioDeps().tts;
  if (!driver) return fail("tts_off", "Voice generation is off.");
  return { ok: true, data: await loadVoiceOptions(driver) };
}
