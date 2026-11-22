import { NewItemDialog } from "@/components/library/new-item-dialog";
import { LibraryFilters } from "@/components/library/library-filters";
import { LibraryList } from "@/components/library/library-list";
import { requireUser } from "@/lib/auth/session";
import { scopedFor } from "@/lib/db/scoped";
import { listLibrary } from "@/lib/library/items";
import { parseLibraryQuery } from "@/lib/library/query";
import { usedInJobs } from "@/lib/library/usage";

// A server component: the filters are a GET form, so every filter is a URL.
export default async function LibraryPage(props: PageProps<"/library">) {
  const user = await requireUser();
  const query = parseLibraryQuery(await props.searchParams);
  const s = scopedFor(user.id);
  const rows = await listLibrary(s, query);
  const keys = rows.flatMap((r) => (r.questionKey === null ? [] : [r.questionKey]));
  const used = await usedInJobs(s, keys);
  const filtered = Boolean(query.q || query.kind || query.tag || query.includeArchived);

  return (
    <div className="flex flex-col gap-6 p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-lg font-semibold">Library</h1>
        <NewItemDialog />
      </div>
      <LibraryFilters q={query.q} kind={query.kind} tag={query.tag} includeArchived={query.includeArchived === true} />
      <LibraryList rows={rows} used={used} filtered={filtered} />
    </div>
  );
}
