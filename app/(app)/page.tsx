import Link from "next/link";

import { AttentionList } from "@/components/home/attention-list";
import { PipelineCounts } from "@/components/home/pipeline-counts";
import { RecentPushes } from "@/components/home/recent-pushes";
import { EmptyState } from "@/components/super-ai/empty-state";
import { buttonVariants } from "@/components/ui/button";
import { requireUser } from "@/lib/auth/session";
import { scopedFor } from "@/lib/db/scoped";
import { HOME_MESSAGES } from "@/lib/attention/messages";
import { getHomeView } from "@/lib/home/read";

export default async function HomePage() {
  const user = await requireUser();
  const home = await getHomeView(scopedFor(user.id), new Date());

  return (
    <div className="flex flex-col gap-6 p-6">
      <h1 className="text-lg font-semibold">Home</h1>
      <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
        <section aria-labelledby="home-today" className="flex min-w-0 flex-col gap-3 lg:flex-1">
          <h2 id="home-today" tabIndex={-1} className="text-base font-semibold text-foreground">
            Today
          </h2>
          {!home.hasActiveJobs ? (
            <EmptyState
              size="panel"
              title={HOME_MESSAGES.noJobsTitle}
              description={HOME_MESSAGES.noJobsDescription}
              action={
                <Link href="/board" className={buttonVariants({ variant: "outline", size: "sm" })}>
                  {HOME_MESSAGES.noJobsAction}
                </Link>
              }
            />
          ) : home.items.length === 0 ? (
            <EmptyState
              size="panel"
              title={HOME_MESSAGES.nothingTitle}
              description={HOME_MESSAGES.nothingDescription}
            />
          ) : (
            <AttentionList items={home.items} />
          )}
        </section>
        <aside aria-label="Summary" className="flex min-w-0 flex-col gap-6 lg:w-80 lg:shrink-0">
          <PipelineCounts counts={home.counts} />
          <RecentPushes pushes={home.pushes} />
        </aside>
      </div>
    </div>
  );
}
