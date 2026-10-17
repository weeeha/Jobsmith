import Link from "next/link";

import { LocalTime } from "@/components/local-time";
import { SIDE_COPY } from "@/lib/attention/copy";
import { kindInfo } from "@/lib/artifacts/kinds";
import { formatDocRef } from "@/lib/artifacts/tabs";
import type { RecentPush } from "@/lib/db/scoped";

// Opens the pushed document itself, on the tab its kind lives under.
function hrefFor(push: RecentPush): string {
  const tab = kindInfo(push.kind).tab;
  if (push.job) return `/jobs/${push.job.slug}?tab=${tab}&doc=${formatDocRef({ scope: "opportunity", key: push.key })}`;
  if (push.companyJobSlug) {
    return `/jobs/${push.companyJobSlug}?tab=${tab}&doc=${formatDocRef({ scope: "company", key: push.key })}`;
  }
  return "/companies";
}

export function RecentPushes({ pushes }: { pushes: RecentPush[] }) {
  return (
    <section aria-labelledby="home-pushes" className="rounded-xl bg-card p-4 text-sm ring-1 ring-foreground/10">
      <h2 id="home-pushes" className="font-medium text-foreground">
        {SIDE_COPY.pushes}
      </h2>
      {pushes.length === 0 ? (
        <p className="mt-3 text-muted-foreground">{SIDE_COPY.noPushes}</p>
      ) : (
        <ul className="mt-3 flex flex-col gap-3">
          {pushes.map((push) => (
            <li key={push.id} className="min-w-0">
              <div className="flex items-baseline justify-between gap-2">
                <Link
                  href={hrefFor(push)}
                  className="min-w-0 break-words font-medium text-foreground underline-offset-4 hover:underline"
                >
                  {push.title}
                </Link>
                <span className="shrink-0 text-xs text-muted-foreground">
                  <LocalTime value={push.createdAt} mode="datetime" />
                </span>
              </div>
              <p className="break-words text-xs text-muted-foreground">
                {push.job ? `${push.job.roleTitle}, ${push.companyName}` : `${push.companyName}, shared research`}
              </p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
