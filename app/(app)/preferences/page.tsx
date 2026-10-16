import { requireUser } from "@/lib/auth/session";
import { scopedFor } from "@/lib/db/scoped";
import { getPreferences } from "@/lib/preferences/save";
import { PreferencesForm } from "@/components/preferences/preferences-form";

export default async function PreferencesPage() {
  const user = await requireUser();
  const preferences = await getPreferences(scopedFor(user.id));
  return (
    <div className="flex flex-col gap-6 p-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-lg font-semibold">Preferences</h1>
        <p className="max-w-160 text-sm text-muted-foreground">
          New jobs are checked against these. Hard filters run in code with no AI. The rest goes to the fit score,
          together with your resume.
        </p>
      </div>
      <PreferencesForm preferences={preferences} />
    </div>
  );
}
