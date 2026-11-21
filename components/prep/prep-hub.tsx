import Link from "next/link";

import { PasteDialogTrigger } from "@/components/job/paste-dialog";
import { BankCard } from "@/components/prep/bank-card";
import { QuestionList } from "@/components/prep/question-list";
import { EmptyState } from "@/components/super-ai/empty-state";
import { buttonVariants } from "@/components/ui/button";
import { DEFAULT_KIND_FOR_TAB } from "@/lib/artifacts/kinds";
import { formatDocRef, type DocRef } from "@/lib/artifacts/tabs";
import type { ArtifactMeta, Scoped, StageRow } from "@/lib/db/scoped";
import { PREP_COPY } from "@/lib/prep/copy";
import { audioDeps } from "@/lib/audio/deps";
import { env } from "@/lib/env";
import { audioContext } from "@/lib/prep/audio-status";
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
  const audio = await audioContext(props.s, audioDeps(), env().TTS);
  const view = await loadPrepHub(props.s, {
    opportunityId: props.opportunityId,
    docs: props.docs,
    stages: props.stages,
    audio,
  });

  // A question bank with no readable question still shows its card, with the
  // notice that says why (spec 5.1 rule 8). The empty state is for a job with
  // no bank card at all.
  if (view.banks.length === 0 && view.pitches.length === 0) {
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
                ttsOn={audio.ttsOn}
              />
            ))}
          </ul>
        </section>
      ))}
      {view.pitches.length > 0 ? (
        <section aria-label={PREP_COPY.hub.pitchesHeading} className="flex flex-col gap-2">
          <h3 className="text-sm font-medium text-muted-foreground">{PREP_COPY.hub.pitchesHeading}</h3>
          <ul className="grid gap-3 md:grid-cols-2">
            {view.pitches.map((pitch) => (
              <li
                key={pitch.key}
                className="flex min-w-0 flex-wrap items-center justify-between gap-3 rounded-xl bg-card p-4 ring-1 ring-foreground/10"
              >
                <h4 className="min-w-0 break-words text-sm font-medium text-foreground">{pitch.title}</h4>
                <Link
                  href={`${props.basePath}/listen?doc=${formatDocRef({ scope: "opportunity", key: pitch.key })}`}
                  aria-label={PREP_COPY.listen.listenPitch(pitch.title)}
                  className={buttonVariants({ size: "sm" })}
                >
                  {PREP_COPY.listen.button}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      {selected && questions.length > 0 ? (
        <section aria-label={`${PREP_COPY.hub.questionsHeading}: ${selected.title}`} className="flex flex-col gap-2">
          <h3 className="text-sm font-medium text-foreground">
            {PREP_COPY.hub.questionsHeading}
            <span className="font-normal text-muted-foreground">{` · ${selected.title}`}</span>
          </h3>
          <QuestionList opportunityId={props.opportunityId} basePath={props.basePath} questions={questions} />
        </section>
      ) : null}
    </div>
  );
}
