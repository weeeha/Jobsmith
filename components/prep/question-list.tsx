"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Play } from "lucide-react";

import { MarkButtons } from "@/components/prep/mark-buttons";
import { MarkChip } from "@/components/prep/mark-chip";
import { ToneChip } from "@/components/fit/fit-chips";
import { formatDocRef } from "@/lib/artifacts/tabs";
import { PREP_COPY } from "@/lib/prep/copy";
import type { HubQuestion } from "@/lib/prep/hub";
import type { MarkLevel } from "@/lib/prep/values";

type Section = { heading: string | null; items: HubQuestion[] };

// Rows arrive in file order; a section is a run of rows sharing a heading.
function sections(questions: HubQuestion[]): Section[] {
  const out: Section[] = [];
  for (const q of questions) {
    const last = out[out.length - 1];
    if (last && last.heading === q.section) last.items.push(q);
    else out.push({ heading: q.section, items: [q] });
  }
  return out;
}

export function QuestionList(props: { opportunityId: string; basePath: string; questions: HubQuestion[] }): React.ReactElement {
  const router = useRouter();
  // A mark shows at once; the refresh brings the card summaries in line.
  const [local, setLocal] = React.useState<Record<string, MarkLevel>>({});

  function marked(questionKey: string, level: MarkLevel) {
    setLocal((prev) => ({ ...prev, [questionKey]: level }));
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-4">
      {sections(props.questions).map((section, si) => (
        <div key={`${section.heading ?? "none"}-${si}`} className="flex flex-col gap-1">
          {section.heading ? (
            <h4 className="text-sm font-medium text-muted-foreground">{section.heading}</h4>
          ) : null}
          <ul className="flex flex-col divide-y divide-border rounded-lg border border-border">
            {section.items.map((q) => {
              const level = local[q.questionKey] ?? q.level;
              return (
                <li key={q.id} className="flex flex-col gap-2 px-3 py-3">
                  <div className="flex flex-wrap items-start gap-x-3 gap-y-1">
                    <p className="min-w-0 flex-1 break-words text-sm text-foreground">
                      <span className="text-muted-foreground">{q.number}. </span>
                      {q.question}
                    </p>
                    <div className="flex shrink-0 flex-wrap items-center gap-1.5">
                      <Link
                        href={`${props.basePath}/listen?doc=${formatDocRef({ scope: "opportunity", key: q.artifactKey })}&q=${q.number}`}
                        aria-label={PREP_COPY.listen.listenFrom(q.number)}
                        className="inline-flex min-h-8 items-center gap-1 rounded-md px-1 text-sm text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        <Play aria-hidden="true" className="size-3.5" />
                        {PREP_COPY.listen.button}
                      </Link>
                      {q.unfilled ? <ToneChip tone="outline">{PREP_COPY.buttons.unfilledChip}</ToneChip> : null}
                      <MarkChip level={level} />
                    </div>
                  </div>
                  <details>
                    <summary
                      aria-label={`${PREP_COPY.hub.markDisclosure} question ${q.number}`}
                      className="inline-flex min-h-8 cursor-pointer items-center rounded-md px-1 text-sm text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      {PREP_COPY.hub.markDisclosure}
                    </summary>
                    <div className="pt-2">
                      <MarkButtons
                        questionKey={q.questionKey}
                        opportunityId={props.opportunityId}
                        scope="job"
                        current={level}
                        onMarked={(next) => marked(q.questionKey, next)}
                      />
                    </div>
                  </details>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </div>
  );
}
