import crypto from "node:crypto";

export type SetupTokenCheck = "not-required" | "ok" | "missing-config" | "mismatch";

/**
 * Decides whether a first-run setup request may proceed.
 *
 * When an operator has configured SETUP_TOKEN, the request must present the
 * same value in the `x-setup-token` header (checked by the caller) to prove
 * it came from someone who can read the deployment's environment, not just
 * someone who can reach the URL. Without a configured token, a production
 * deployment fails closed (`missing-config`): silently allowing anyone to
 * claim the instance is exactly the vulnerability this exists to close.
 * Outside production (local development), no token is required at all.
 */
export function checkSetupToken({
  configured,
  provided,
  production,
}: {
  configured: string | undefined;
  provided: string | undefined;
  production: boolean;
}): SetupTokenCheck {
  if (!configured) {
    return production ? "missing-config" : "not-required";
  }

  // Hash both sides to a fixed-length digest before comparing: timingSafeEqual
  // throws on a length mismatch rather than returning false, which would
  // otherwise leak the configured token's length to a timing-observant
  // attacker one guess at a time.
  const expected = crypto.createHash("sha256").update(configured).digest();
  const actual = crypto.createHash("sha256").update(provided ?? "").digest();
  return crypto.timingSafeEqual(expected, actual) ? "ok" : "mismatch";
}
