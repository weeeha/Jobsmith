"use server";

import { redirect } from "next/navigation";
import { isFirstRun } from "@/lib/auth/first-run";
import { auth } from "@/lib/auth";
import { scopedFor } from "@/lib/db/scoped";

export type SetupState = { error: string } | undefined;

export async function setupAction(
  _state: SetupState,
  formData: FormData,
): Promise<SetupState> {
  if (!(await isFirstRun())) {
    redirect("/login");
  }

  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  if (!email || !password) {
    return { error: "Email and password are required." };
  }

  let userId: string;
  try {
    const result = await auth.api.signUpEmail({ body: { email, password, name: email } });
    userId = result.user.id;
  } catch {
    return { error: "Could not create the account. Check the password length and try again." };
  }

  await scopedFor(userId).profile.upsert({});

  redirect("/board");
}
