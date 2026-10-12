import Link from "next/link";

import { LocalTime } from "@/components/local-time";
import { HOME_MESSAGES, documentsLabel } from "@/lib/attention/messages";
import type { RecentPush } from "@/lib/home/read";

export function RecentPushes({ pushes }: { pushes: RecentPush[] }) {
  return (
    <section aria-labelledby="home-pushes" className="flex flex-col gap-3">
      <h2 id="home-pushes" className="text-base font-semibold text-foreground">
        Recent pushes
      </h2>
      {pushes.length === 0 ? (
        <p className="text-sm text-muted-foreground">{HOME_MESSAGES.noPushes}</p>
      ) : (
        <ul className="flex flex-col divide-y rounded-lg border">
          {pushes.map((push) => (
            <li key={push.id} className="flex flex-col gap-1 px-4 py-2 text-sm">
              <Link href={`/jobs/${push.slug}?tab=documents`} className="font-medium break-words text-foreground hover:underline">
                {push.roleTitle} at {push.companyName}
              </Link>
              <span className="text-muted-foreground">
                {documentsLabel(push.documents)}, <LocalTime value={push.occurredAt} mode="datetime" />
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
