import { PasteDialogTrigger } from "@/components/job/paste-dialog";
import { BankCard } from "@/components/prep/bank-card";
import { QuestionList } from "@/components/prep/question-list";
import { EmptyState } from "@/components/super-ai/empty-state";
import { DEFAULT_KIND_FOR_TAB } from "@/lib/artifacts/kinds";
import type { DocRef } from "@/lib/artifacts/tabs";
import type { ArtifactMeta, Scoped, StageRow } from "@/lib/db/scoped";
import { PREP_COPY } from "@/lib/prep/copy";
import { loadPrepHub } from "@/lib/prep/hub";

export async function PrepHub(props: {
  s: Scoped;
  opportunityId: string;
  slug: string;
  docs: ArtifactMeta[];
  stages: StageRow[];
  docRef: DocRef | null;
  basePath: string;
}): Promise<React.ReactElement> {
  const view = await loadPrepHub(props.s, {
    opportunityId: props.opportunityId,
    docs: props.docs,
    stages: props.stages,
  });

  if (view.empty) {
    return (
      <EmptyState
        size="panel"
        title={PREP_COPY.empty}
        description={
          <>
            {PREP_COPY.hub.pushLead} <code className="break-all font-mono">{`jobsmith push ${props.slug}`}</code>
          </>
        }
        action={
          <PasteDialogTrigger
            opportunityId={props.opportunityId}
            target={{ mode: "new" }}
            defaultKind={DEFAULT_KIND_FOR_TAB.prep}
            stages={props.stages.map((st) => ({ id: st.id, label: st.label }))}
            label={PREP_COPY.hub.pasteLabel}
            variant="outline"
          />
        }
      />
    );
  }

  // The document picked in the list below also picks the bank here; with none
  // picked, the first bank that has questions.
  const withQuestions = view.banks.filter((b) => b.questionCount > 0);
  const selected =
    (props.docRef?.scope === "opportunity" ? withQuestions.find((b) => b.key === props.docRef?.key) : undefined) ??
    withQuestions[0] ??
    null;
  const questions = selected ? view.questions.filter((q) => q.artifactKey === selected.key) : [];

  return (
    <div className="flex flex-col gap-4">
      {view.groups.map((group) => (
        <section key={group.stageId ?? "general"} aria-label={group.heading} className="flex flex-col gap-2">
          <h3 className="text-sm font-medium text-muted-foreground">{group.heading}</h3>
          <ul className="grid gap-3 md:grid-cols-2">
            {group.banks.map((card) => (
              <BankCard
                key={card.key}
                card={card}
                opportunityId={props.opportunityId}
                basePath={props.basePath}
                selected={selected?.key === card.key}
              />
            ))}
          </ul>
        </section>
      ))}
      {selected && questions.length > 0 ? (
        <section aria-label={`${PREP_COPY.hub.questionsHeading}: ${selected.title}`} className="flex flex-col gap-2">
          <h3 className="text-sm font-medium text-foreground">
            {PREP_COPY.hub.questionsHeading}
            <span className="font-normal text-muted-foreground">{` · ${selected.title}`}</span>
          </h3>
          <QuestionList opportunityId={props.opportunityId} questions={questions} />
        </section>
      ) : null}
    </div>
  );
}
