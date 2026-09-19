export const sessionPolicy = {
  expiresInDays: 30,
  refreshAfterDays: 1,
};

export const MIN_PASSWORD_LENGTH = 12;

const DEFAULT_SIGNIN_MAX_PER_MINUTE = 5;

export function signInMaxPerMinute(
  source: Record<string, string | undefined> = process.env,
): number {
  const raw = source.AUTH_SIGNIN_MAX_PER_MINUTE;
  if (!raw) return DEFAULT_SIGNIN_MAX_PER_MINUTE;
  const value = Number(raw);
  return Number.isInteger(value) && value >= 1 ? value : DEFAULT_SIGNIN_MAX_PER_MINUTE;
}

// Without a reverse proxy in front of this app, there is no x-forwarded-for
// header, so better-auth's rate limiter has no client address to key on and
// every visitor shares one bucket: at the configured limit, a handful of
// failed sign-ins from anywhere would lock out every visitor, including the
// owner, for a minute. Raising the ceiling only in that situation (never
// lowering a limit that is already higher) keeps a real reverse-proxy
// deployment at the tight per-client default while a bare deployment stays
// usable.
const MIN_SIGNIN_MAX_PER_MINUTE_WITHOUT_CLIENT_ADDRESS = 30;

export function signInRateLimitRule(
  hasClientAddress: boolean,
  source: Record<string, string | undefined> = process.env,
): { window: number; max: number } {
  const configured = signInMaxPerMinute(source);
  return {
    window: 60,
    max: hasClientAddress
      ? configured
      : Math.max(configured, MIN_SIGNIN_MAX_PER_MINUTE_WITHOUT_CLIENT_ADDRESS),
  };
}
