import type { Scoped } from "@/lib/db/scoped";
import { ok, type Result } from "@/lib/result";
import { parsePreferences, toPreferencesDocument, type Preferences, type PreferencesInput } from "./schema";

export async function getPreferences(s: Scoped): Promise<Preferences> {
  const row = await s.profile.get();
  return parsePreferences(row?.preferences);
}

/** Replaces the whole document. Headline, resume and time zone are left as they are. */
export async function savePreferences(s: Scoped, input: PreferencesInput): Promise<Result<Preferences, never>> {
  const document = toPreferencesDocument(input);
  await s.profile.upsert({ preferences: document });
  return ok(document);
}
