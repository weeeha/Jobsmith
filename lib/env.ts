import { z } from "zod";

const rawEnvSchema = z.object({
  DATABASE_URL: z.string().min(1),
  BETTER_AUTH_SECRET: z.string().min(32),
  ALLOW_SIGNUP: z
    .string()
    .optional()
    .transform((value) => value === "true"),
  // Gates account creation until the first account exists (see
  // lib/auth/setup-token.ts). Optional, but at least 16 characters when set,
  // so a trivially short value can't be brute-forced.
  SETUP_TOKEN: z.string().min(16).optional(),
});

export type Env = {
  DATABASE_URL: string;
  BETTER_AUTH_SECRET: string;
  APP_URL: string;
  ALLOW_SIGNUP: boolean;
  SETUP_TOKEN: string | undefined;
  TRUSTED_ORIGINS: string[];
};

export class EnvError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EnvError";
  }
}

function resolveAppUrl(source: Record<string, string | undefined>): string | undefined {
  if (source.APP_URL) return source.APP_URL;
  if (source.VERCEL_ENV === "production" && source.VERCEL_PROJECT_PRODUCTION_URL) {
    return `https://${source.VERCEL_PROJECT_PRODUCTION_URL}`;
  }
  if (source.VERCEL_BRANCH_URL) return `https://${source.VERCEL_BRANCH_URL}`;
  if (source.VERCEL_URL) return `https://${source.VERCEL_URL}`;
  return undefined;
}

function resolveTrustedOrigins(
  source: Record<string, string | undefined>,
  appUrl: string | undefined,
): string[] {
  const origins = new Set<string>();
  if (appUrl) origins.add(appUrl);
  for (const key of ["VERCEL_URL", "VERCEL_BRANCH_URL", "VERCEL_PROJECT_PRODUCTION_URL"] as const) {
    const value = source[key];
    if (value) origins.add(`https://${value}`);
  }
  return [...origins];
}

export function parseEnv(source: Record<string, string | undefined>): Env {
  const result = rawEnvSchema.safeParse(source);

  const appUrl = resolveAppUrl(source);
  const urlResult = appUrl ? z.url().safeParse(appUrl) : undefined;

  if (!result.success || !urlResult?.success) {
    const names = new Set<string>();
    if (!result.success) {
      for (const issue of result.error.issues) names.add(issue.path.join("."));
    }
    if (!urlResult?.success) names.add("APP_URL");
    throw new EnvError(`Invalid environment variables: ${[...names].join(", ")}`);
  }

  return {
    DATABASE_URL: result.data.DATABASE_URL,
    BETTER_AUTH_SECRET: result.data.BETTER_AUTH_SECRET,
    APP_URL: urlResult.data,
    ALLOW_SIGNUP: result.data.ALLOW_SIGNUP,
    SETUP_TOKEN: result.data.SETUP_TOKEN,
    TRUSTED_ORIGINS: resolveTrustedOrigins(source, urlResult.data),
  };
}

let cached: Env | undefined;

export function env(): Env {
  if (!cached) {
    cached = parseEnv(process.env);
  }
  return cached;
}
