import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { createAuthMiddleware, APIError } from "better-auth/api";
import { getDb } from "@/lib/db/client";
import * as schema from "@/lib/db/schema";
import { env } from "@/lib/env";
import { countUsers } from "./users";
import { signUpAllowed } from "./signup-gate";
import { checkSetupToken } from "./setup-token";
import { sessionPolicy, MIN_PASSWORD_LENGTH, signInMaxPerMinute } from "./policy";

export const auth = betterAuth({
  database: drizzleAdapter(getDb(), { provider: "pg", schema }),
  baseURL: env().APP_URL,
  trustedOrigins: env().TRUSTED_ORIGINS,
  secret: env().BETTER_AUTH_SECRET,
  emailAndPassword: { enabled: true, minPasswordLength: MIN_PASSWORD_LENGTH },
  session: {
    expiresIn: sessionPolicy.expiresInDays * 24 * 60 * 60,
    updateAge: sessionPolicy.refreshAfterDays * 24 * 60 * 60,
  },
  rateLimit: {
    // True everywhere this app runs. Next compiles NODE_ENV into a build as
    // "production", so the server the end-to-end suite starts is limited too;
    // that suite raises AUTH_SIGNIN_MAX_PER_MINUTE instead (playwright.config.ts).
    enabled: process.env.NODE_ENV !== "test",
    storage: "database",
    window: 60,
    max: 60,
    customRules: {
      "/sign-in/email": { window: 60, max: signInMaxPerMinute() },
    },
  },
  hooks: {
    before: createAuthMiddleware(async (ctx) => {
      if (ctx.path !== "/sign-up/email") return;
      const userCount = await countUsers(getDb());
      if (!signUpAllowed(userCount, env().ALLOW_SIGNUP)) {
        throw new APIError("FORBIDDEN", { message: "Sign-up is closed." });
      }
      // Before the first account exists, anyone who reaches this endpoint
      // could otherwise claim the instance. This runs for both the HTTP
      // endpoint (ctx.headers is the real request's headers) and a
      // server-side auth.api.signUpEmail call, which passes the same header
      // through its own `headers` option.
      if (userCount === 0) {
        const tokenCheck = checkSetupToken({
          configured: env().SETUP_TOKEN,
          provided: ctx.headers?.get("x-setup-token") ?? undefined,
          production: process.env.NODE_ENV === "production",
        });
        if (tokenCheck !== "ok" && tokenCheck !== "not-required") {
          throw new APIError("FORBIDDEN", { message: "Setup token required." });
        }
      }
    }),
  },
  plugins: [nextCookies()],
});
