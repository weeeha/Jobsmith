"use server";

import { redirect } from "next/navigation";
import { isFirstRun } from "@/lib/auth/first-run";
import { auth } from "@/lib/auth";
import { scopedFor } from "@/lib/db/scoped";
import { checkSetupToken } from "@/lib/auth/setup-token";
import { env } from "@/lib/env";

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
  const setupTokenValue = formData.get("setupToken");
  const setupToken = typeof setupTokenValue === "string" ? setupTokenValue : undefined;

  if (!email || !password) {
    return { error: "Email and password are required." };
  }

  // Checked here, before calling signUpEmail, so a wrong token gets its own
  // message instead of falling into the generic catch below. The sign-up
  // hook (lib/auth/index.ts) re-checks the same token and is the real gate:
  // it also covers a direct HTTP call to the endpoint, which never runs this
  // action at all.
  const tokenCheck = checkSetupToken({
    configured: env().SETUP_TOKEN,
    provided: setupToken,
    production: process.env.NODE_ENV === "production",
  });
  if (tokenCheck === "mismatch") {
    return { error: "That setup token is not right." };
  }

  let userId: string;
  try {
    const result = await auth.api.signUpEmail({
      body: { email, password, name: email },
      headers: setupToken ? { "x-setup-token": setupToken } : undefined,
    });
    userId = result.user.id;
  } catch (error) {
    console.error("setup failed", error);
    return { error: "Could not create the account. Check the password length and try again." };
  }

  await scopedFor(userId).profile.upsert({});

  redirect("/board");
}
