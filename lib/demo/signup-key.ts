import crypto from "node:crypto";

// The sign-up hook (lib/auth/index.ts) lets a request through the closed
// sign-up gate only when it carries this header with this process's key.
// The key is random per server process and never leaves it: only an
// in-process auth.api.signUpEmail call from createDemoAccount can send it,
// so a visitor calling the HTTP endpoint directly cannot open sign-up.
export const DEMO_SIGNUP_HEADER = "x-demo-signup";

const key = crypto.randomBytes(32).toString("base64url");

export function demoSignupKey(): string {
  return key;
}

export function isDemoSignupKey(provided: string | null | undefined): boolean {
  if (!provided) return false;
  const a = Buffer.from(provided);
  const b = Buffer.from(key);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
