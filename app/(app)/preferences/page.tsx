import { PreferencesForm } from "@/components/preferences/preferences-form";
import { TestPostingBox } from "@/components/preferences/test-posting";
import { requireUser } from "@/lib/auth/session";
import { scopedFor } from "@/lib/db/scoped";
import { hasHardFilters } from "@/lib/preferences/schema";
import { loadProfile } from "@/lib/profile/store";

// The test box on this page fetches a posting and scores it in one request
// (up to about 45 seconds), past the framework's default.
export const maxDuration = 60;

export default async function PreferencesPage() {
  const user = await requireUser();
  const profile = await loadProfile(scopedFor(user.id));

  return (
    <div className="flex flex-col gap-6 p-6">
      <h1 className="text-lg font-semibold">Preferences</h1>
      <p className="max-w-2xl text-sm text-muted-foreground">
        Jobsmith checks each job against your hard filters and gives it a fit score from your resume and these
        preferences. A job that misses a filter is only flagged, never hidden.
      </p>
      <PreferencesForm preferences={profile.preferences} />
      <TestPostingBox
        hasHardFilters={hasHardFilters(profile.preferences)}
        threshold={profile.preferences.scoreThreshold}
      />
    </div>
  );
}
