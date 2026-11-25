import Link from "next/link";

import { LocalTime } from "@/components/local-time";
import { MarkChip } from "@/components/prep/mark-chip";
import { LIBRARY_COPY } from "@/lib/library/copy";
import type { MarkHistory as History } from "@/lib/library/usage";

function drilled(count: number, last: Date | null): string | null {
  return count > 0 && last ? LIBRARY_COPY.drilledTimes(count) : null;
}

// Every job's mark for the question, newest first, then the library's own.
export function MarkHistory({ history }: { history: History }): React.ReactElement {
  const empty = history.jobs.length === 0 && history.library === null;
  return (
    <section aria-labelledby="mark-history-heading" className="flex flex-col gap-2">
      <h2 id="mark-history-heading" className="text-sm font-medium text-foreground">
        {LIBRARY_COPY.markHistory}
      </h2>
      {empty ? (
        <p className="text-sm text-muted-foreground">{LIBRARY_COPY.noMarks}</p>
      ) : (
        <ul className="flex flex-col divide-y divide-border rounded-lg border border-border">
          {history.jobs.map((job) => (
            <li key={job.opportunityId} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2">
              <Link
                href={`/jobs/${job.slug}?tab=prep`}
                className="min-w-0 flex-1 break-words rounded-md text-sm text-foreground underline underline-offset-4 outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {job.companyName}, {job.roleTitle}
              </Link>
              <MarkChip level={job.level} />
              <span className="text-xs text-muted-foreground">
                <LocalTime value={job.markedAt} />
                {drilled(job.drillCount, job.lastDrilledAt) ? `, ${drilled(job.drillCount, job.lastDrilledAt)}` : ""}
              </span>
            </li>
          ))}
          {history.library ? (
            <li className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2">
              <span className="min-w-0 flex-1 text-sm text-foreground">{LIBRARY_COPY.libraryMark}</span>
              <MarkChip level={history.library.level} />
              <span className="text-xs text-muted-foreground">
                <LocalTime value={history.library.markedAt} />
                {drilled(history.library.drillCount, history.library.lastDrilledAt)
                  ? `, ${drilled(history.library.drillCount, history.library.lastDrilledAt)}`
                  : ""}
              </span>
            </li>
          ) : null}
        </ul>
      )}
    </section>
  );
}
