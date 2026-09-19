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
