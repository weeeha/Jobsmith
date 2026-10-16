import type { Scoped } from "@/lib/db/scoped";
import { parsePreferences, type Preferences } from "@/lib/preferences/schema";

/** What a fit score is computed from, besides the posting. */
export type FitProfile = { headline: string | null; resumeMd: string | null; preferences: Preferences };

// One read of the profile row for both halves: the resume and headline that
// part A's profile form saves, and the preferences document.
export async function loadFitProfile(s: Scoped): Promise<FitProfile> {
  const row = await s.profile.get();
  return {
    headline: row?.headline ?? null,
    resumeMd: row?.resumeMd ?? null,
    preferences: parsePreferences(row?.preferences),
  };
}
