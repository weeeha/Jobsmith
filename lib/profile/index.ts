import { z } from "zod";
import type { Scoped } from "@/lib/db/scoped";
import { ok, type Result } from "@/lib/result";
import { isTimeZone } from "@/lib/time/zone";

export const HEADLINE_MAX = 200;
export const RESUME_MAX = 100_000;
export const DEFAULT_TIME_ZONE = "UTC";

export type ProfileView = { headline: string | null; timezone: string; resumeMd: string | null };

// Blank headline or resume means "cleared" (null), not "left as it was".
export const profileInputSchema = z.object({
  headline: z
    .string()
    .trim()
    .max(HEADLINE_MAX, "Keep the headline under 200 characters.")
    .transform((v) => (v === "" ? null : v)),
  timezone: z
    .string()
    .trim()
    .refine(isTimeZone, "Pick a time zone from the list, like America/New_York."),
  resumeMd: z
    .string()
    .max(RESUME_MAX, "Keep the resume under 100,000 characters.")
    .transform((v) => (v.trim() === "" ? null : v)),
});

export type ProfileInput = z.infer<typeof profileInputSchema>;

export function profileFromForm(formData: FormData) {
  const read = (name: string) => {
    const value = formData.get(name);
    return typeof value === "string" ? value : "";
  };
  return { headline: read("headline"), timezone: read("timezone"), resumeMd: read("resumeMd") };
}

/** Every zone this runtime knows, for the time zone field's suggestions. */
export function timeZoneOptions(): string[] {
  const zones = Intl.supportedValuesOf("timeZone");
  return zones.includes(DEFAULT_TIME_ZONE) ? zones : [DEFAULT_TIME_ZONE, ...zones];
}

export async function getProfile(s: Scoped): Promise<ProfileView> {
  const row = await s.profile.get();
  return {
    headline: row?.headline ?? null,
    timezone: row?.timezone && isTimeZone(row.timezone) ? row.timezone : DEFAULT_TIME_ZONE,
    resumeMd: row?.resumeMd ?? null,
  };
}

/** Writes headline, time zone and resume. Preferences are left as they are. */
export async function saveProfile(s: Scoped, input: ProfileInput): Promise<Result<ProfileView, never>> {
  const row = await s.profile.upsert({ headline: input.headline, timezone: input.timezone, resumeMd: input.resumeMd });
  return ok({ headline: row.headline, timezone: row.timezone, resumeMd: row.resumeMd });
}
