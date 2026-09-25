import { requireUser } from "@/lib/auth/session";
import { EmptyState } from "@/components/super-ai/empty-state";

export default async function PreferencesPage() {
  await requireUser();
  return (
    <div className="flex flex-col gap-6 p-6">
      <h1 className="text-lg font-semibold">Preferences</h1>
      <EmptyState
        size="page"
        title="Preferences come with fit scoring."
        description="Titles, locations, pay floor and dealbreakers will live here, and new jobs get scored against them."
      />
    </div>
  );
}
