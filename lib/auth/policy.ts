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

// When better-auth's rate limiter cannot tie a request to one client, every
// such request shares one bucket: at the configured limit, a handful of
// failed sign-ins from anywhere would lock out every visitor, including the
// owner, for a minute. That happens with no x-forwarded-for header at all
// (no reverse proxy), and also when the header holds a chain of addresses
// or something that is not an address, because the library trusts only a
// single valid address unless `trustedProxies` is configured. Raising the
// ceiling only in that situation (never lowering a limit that is already
// higher) keeps a deployment behind one reverse proxy at the tight
// per-client default while the others stay usable.
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
