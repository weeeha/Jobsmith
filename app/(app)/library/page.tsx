import { requireUser } from "@/lib/auth/session";
import { EmptyState } from "@/components/super-ai/empty-state";

export default async function LibraryPage() {
  await requireUser();
  return (
    <div className="flex flex-col gap-6 p-6">
      <h1 className="text-lg font-semibold">Library</h1>
      <EmptyState
        size="page"
        title="Your library comes with interview prep."
        description="Stories, pitches and question banks you reuse across jobs will live here."
      />
    </div>
  );
}
