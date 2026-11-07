// Rules for throwaway demo accounts (DEMO_MODE). Pure, so they can be tested
// without a database.

/** Demo accounts live under this reserved domain, which can never receive mail. */
export const DEMO_EMAIL_DOMAIN = "demo.invalid";

/** How long a demo copy lives before the next demo click deletes it. */
export const DEMO_TTL_HOURS = 24;

/** At most this many new demo copies per minute, across all visitors. */
export const DEMO_MAX_PER_MINUTE = 10;

/** At most this many demo copies alive at once, so the database stays small. */
export const DEMO_MAX_ALIVE = 200;

export function isDemoEmail(email: string): boolean {
  return email.toLowerCase().endsWith(`@${DEMO_EMAIL_DOMAIN}`);
}

export function demoExpiryCutoff(now: Date): Date {
  return new Date(now.getTime() - DEMO_TTL_HOURS * 60 * 60 * 1000);
}

export type DemoCapacity = { createdLastMinute: number; alive: number };

/** Whether one more demo copy may be created right now. */
export function demoCreationAllowed({ createdLastMinute, alive }: DemoCapacity): boolean {
  return createdLastMinute < DEMO_MAX_PER_MINUTE && alive < DEMO_MAX_ALIVE;
}
