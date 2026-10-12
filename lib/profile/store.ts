import type { Scoped } from "@/lib/db/scoped";
import { parsePreferences, type Preferences } from "@/lib/preferences/schema";
import type { ProfileInput } from "@/lib/profile/schema";
import { canonicalTimeZone } from "@/lib/time/zone";

export type ProfileView = {
  headline: string | null;
  resumeMd: string | null;
  timezone: string;
  preferences: Preferences;
  updatedAt: Date | null;
};

// A user with no profile row, a bad stored zone or unreadable preferences
// still gets a usable view: pages never fail on stored profile data.
export async function loadProfile(s: Scoped): Promise<ProfileView> {
  const row = await s.profile.get();
  if (!row) {
    return { headline: null, resumeMd: null, timezone: "UTC", preferences: parsePreferences({}), updatedAt: null };
  }
  return {
    headline: row.headline,
    resumeMd: row.resumeMd,
    timezone: canonicalTimeZone(row.timezone) ?? "UTC",
    preferences: parsePreferences(row.preferences),
    updatedAt: row.updatedAt,
  };
}

export async function saveProfile(s: Scoped, input: ProfileInput): Promise<void> {
  await s.profile.upsert({ headline: input.headline, resumeMd: input.resumeMd, timezone: input.timezone });
}

export async function savePreferences(s: Scoped, preferences: Preferences): Promise<void> {
  await s.profile.upsert({ preferences });
}
