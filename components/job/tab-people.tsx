import { PersonDialogTrigger, PersonRowActions } from "@/components/job/person-dialog";
import { EmptyState } from "@/components/super-ai/empty-state";
import { PERSON_ROLE_LABELS } from "@/lib/pipeline/labels";
import type { LinkedPerson } from "@/lib/db/scoped";

export function TabPeople({
  opportunityId,
  stages,
  people,
}: {
  opportunityId: string;
  stages: { id: string; label: string }[];
  people: LinkedPerson[];
}) {
  return (
    <section aria-label="People" className="flex flex-col gap-4 py-4">
      <div>
        <PersonDialogTrigger opportunityId={opportunityId} stages={stages} />
      </div>

      {people.length === 0 ? (
        <EmptyState size="panel" title="No people yet." />
      ) : (
        <ul className="flex flex-col gap-2">
          {people.map((link) => {
            const stageLabel = stages.find((stage) => stage.id === link.stageId)?.label;
            return (
              <li
                key={link.linkId}
                className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border p-3"
              >
                <div className="flex min-w-0 flex-col">
                  {/* break-words (Task 11 fix round 1, Finding 1): an
                      unbroken long name or title has no other wrap point
                      inside this flex row and would otherwise force
                      page-level horizontal overflow, the same risk
                      tab-overview.tsx and tab-timeline.tsx already guard
                      against. */}
                  <p className="break-words text-sm font-medium text-foreground">
                    {link.person.name}
                    {link.person.title ? (
                      <span className="font-normal text-muted-foreground"> · {link.person.title}</span>
                    ) : null}
                  </p>
                  <p className="break-words text-xs text-muted-foreground">
                    {PERSON_ROLE_LABELS[link.role]}
                    {stageLabel ? ` · ${stageLabel}` : ""}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-1.5">
                  <PersonRowActions
                    opportunityId={opportunityId}
                    linkId={link.linkId}
                    person={{
                      name: link.person.name,
                      title: link.person.title,
                      linkedinUrl: link.person.linkedinUrl,
                      email: link.person.email,
                      notesMd: link.person.notesMd,
                    }}
                    role={link.role}
                    stageId={link.stageId}
                    stages={stages}
                  />
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
