import { Suspense } from "react";

import { requireUser } from "@/lib/auth/session";
import { scopedFor } from "@/lib/db/scoped";
import { loadHome } from "@/lib/attention/load";
import { homeSubline } from "@/lib/attention/copy";
import { AttentionList } from "@/components/home/attention-list";
import { HomeSkeleton } from "@/components/home/home-skeleton";
import { PipelineCard } from "@/components/home/pipeline-card";
import { RecentPushes } from "@/components/home/recent-pushes";
import { RefreshOnFocus } from "@/components/refresh-on-focus";

export default async function HomePage() {
  const user = await requireUser();

  return (
    <div className="p-6">
      {/* tabIndex -1: focus lands here when the last attention item goes away. */}
      <h1 tabIndex={-1} className="text-lg font-semibold outline-none">
        Home
      </h1>
      {/* A Suspense boundary here, not a loading.tsx, because a loading.tsx in
          app/(app) would wrap every route in the group, not only Home. */}
      <Suspense fallback={<HomeSkeleton />}>
        <HomeContent userId={user.id} />
      </Suspense>
      <RefreshOnFocus />
    </div>
  );
}

async function HomeContent({ userId }: { userId: string }) {
  const { items, columns, pushes } = await loadHome(scopedFor(userId), new Date());
  const subline = homeSubline(items.length);

  return (
    <>
      {subline ? <p className="mt-2 text-muted-foreground">{subline}</p> : null}
      <div className="mt-6 flex flex-col gap-6 lg:flex-row lg:items-start">
        <div className="min-w-0 flex-1">
          <AttentionList items={items} />
        </div>
        <aside className="flex flex-col gap-6 lg:w-80 lg:shrink-0">
          <PipelineCard columns={columns} />
          <RecentPushes pushes={pushes} />
        </aside>
      </div>
    </>
  );
}
