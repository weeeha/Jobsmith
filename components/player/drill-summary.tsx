"use client";

import * as React from "react";
import Link from "next/link";
import { toast } from "sonner";

import { endSessionAction } from "@/app/(app)/jobs/[slug]/prep-actions";
import { SaveToLibraryButton } from "@/components/library/save-to-library-button";
import { MarkChip } from "@/components/prep/mark-chip";
import { buttonVariants } from "@/components/ui/button";
import { LIBRARY_COPY } from "@/lib/library/copy";
import { PREP_COPY } from "@/lib/prep/copy";
import type { DrillSummary as Summary } from "@/lib/prep/drill-summary";
import { cn } from "@/lib/utils";

/**
 * The end of a drill: the marks given, what is still shaky, a link to drill
 * just those, and the one end-of-session call that writes the timeline event.
 * With no session (the start call failed) nothing is ended.
 */
export function DrillSummary(props: {
  summary: Summary;
  scope?: "job" | "library";
  // null in the Library's drill, which has no job.
  slug: string | null;
  docRef: string | null;
  sessionId: string | null;
  seen: number;
  // The job the questions belong to; with it, each marked question can be saved to the library.
  opportunityId?: string | null;
}): React.ReactElement {
  const { summary, sessionId, seen } = props;
  const copy = PREP_COPY.drill;
  const ended = React.useRef(false);

  React.useEffect(() => {
    if (ended.current || sessionId === null) return;
    ended.current = true;
    endSessionAction({ id: sessionId, seen, marked: summary.marks.length, solid: summary.solid })
      .then((result) => {
        if (!result.ok) toast.error(result.message);
      })
      .catch((error) => {
        console.error("end session failed", error);
        toast.error(copy.sessionEndFailed);
      });
  }, [sessionId, seen, summary, copy.sessionEndFailed]);

  const library = props.scope === "library";
  const againHref = library
    ? "/library/drill?only=shaky"
    : `/jobs/${props.slug}/drill?${props.docRef ? `doc=${props.docRef}&` : ""}only=shaky`;
  const headingRef = React.useRef<HTMLHeadingElement>(null);
  React.useEffect(() => {
    headingRef.current?.focus();
  }, []);

  return (
    <section aria-labelledby="drill-summary-heading" className="flex flex-col gap-5 rounded-xl bg-card p-6 ring-1 ring-foreground/10">
      <div className="flex flex-col gap-1">
        <h2
          id="drill-summary-heading"
          ref={headingRef}
          tabIndex={-1}
          className="text-lg font-semibold text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {copy.summaryHeading}
        </h2>
        <p className="text-sm text-muted-foreground">{copy.summaryCounts(summary.marks.length, summary.skipped)}</p>
      </div>

      {summary.marks.length > 0 ? (
        <ul aria-label={copy.marksHeading} className="flex flex-col divide-y divide-border">
          {summary.marks.map((m) => (
            <li key={m.questionKey} className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1 py-2">
              <p className="min-w-0 flex-1 break-words text-sm text-foreground">{m.question}</p>
              <div className="flex shrink-0 flex-wrap items-center gap-1.5">
                <MarkChip level={m.level} />
                {props.opportunityId ? (
                  <SaveToLibraryButton opportunityId={props.opportunityId} questionKey={m.questionKey} questionLabel={m.question} />
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">{copy.noMarks}</p>
      )}

      {summary.stillShaky.length > 0 ? (
        <div className="flex flex-col gap-2">
          <h3 className="text-sm font-medium text-foreground">{copy.stillShaky}</h3>
          <ul aria-label={copy.stillShaky} className="flex flex-col gap-1">
            {summary.stillShaky.map((q) => (
              <li key={q.questionKey} className="break-words text-sm text-foreground">
                {q.question}
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">{copy.noneShaky}</p>
      )}

      <div className="flex flex-wrap items-center gap-3">
        {summary.stillShaky.length > 0 ? (
          <Link href={againHref} className={buttonVariants({ size: "lg" })}>
            {copy.again}
          </Link>
        ) : null}
        <Link
          href={library ? "/library" : `/jobs/${props.slug}?tab=prep`}
          className={cn(buttonVariants({ variant: "outline", size: "lg" }))}
        >
          {library ? LIBRARY_COPY.back : copy.back}
        </Link>
      </div>
    </section>
  );
}
