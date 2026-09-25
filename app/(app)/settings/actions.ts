"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/auth/session";
import { scopedFor } from "@/lib/db/scoped";
import { createApiToken, revokeApiToken, tokenNameSchema, type TokenFormState } from "@/lib/auth/api-token";
import { messageFor } from "@/lib/pipeline/messages";
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
