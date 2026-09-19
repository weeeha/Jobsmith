import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { createAuthMiddleware, APIError } from "better-auth/api";
import { getDb } from "@/lib/db/client";
import * as schema from "@/lib/db/schema";
import { env } from "@/lib/env";
import { countUsers } from "./users";
import { signUpAllowed } from "./signup-gate";
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
    }),
  },
  plugins: [nextCookies()],
});
