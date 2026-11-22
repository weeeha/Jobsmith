import { QuickFireRound } from "@/components/player/quick-fire-round";
import { requireUser } from "@/lib/auth/session";
import { scopedFor } from "@/lib/db/scoped";
import { LIBRARY_COPY } from "@/lib/library/copy";
import { loadLibraryQuickFirePool } from "@/lib/library/practice";

// A server component that only reads: the client starts and ends the session.
// The round has no job, so its marks use the library scope.
export default async function LibraryQuickFirePage() {
  const user = await requireUser();
  const pool = await loadLibraryQuickFirePool(scopedFor(user.id));
  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-4 p-4 sm:p-6">
      <h1 className="text-lg font-semibold text-foreground">{LIBRARY_COPY.quickFire}</h1>
      <QuickFireRound
        scope="library"
        questions={pool.map((q) => ({ questionKey: q.questionKey, question: q.question, spine: q.spine ?? "", level: q.level }))}
        opportunityId={null}
        backHref="/library"
        backLabel={LIBRARY_COPY.back}
        emptyTitle={LIBRARY_COPY.quickFireEmpty}
      />
    </div>
  );
}
