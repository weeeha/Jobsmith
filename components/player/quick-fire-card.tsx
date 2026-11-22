"use client";

import * as React from "react";
import Link from "next/link";
import { toast } from "sonner";

import { endSessionAction } from "@/app/(app)/jobs/[slug]/prep-actions";
import { useAnnounce } from "@/components/live-announcer";
import { MarkButtons, useMark } from "@/components/prep/mark-buttons";
import { MarkChip } from "@/components/prep/mark-chip";
import { useCountdown } from "@/components/player/use-countdown";
import { EmptyState } from "@/components/super-ai/empty-state";
import { Button, buttonVariants } from "@/components/ui/button";
import { PREP_COPY, quickFireProgress } from "@/lib/prep/copy";
import { QUICK_FIRE_SECONDS } from "@/lib/prep/quick-fire";
import type { MarkLevel } from "@/lib/prep/values";
import { MARK_LEVELS, type MarkScope } from "@/lib/prep/values";
import { cn } from "@/lib/utils";

export type QuickFireQuestion = {
  questionKey: string;
  // Library questions have no number: they come from several jobs.
  number?: number;
  question: string;
  spine: string;
  level: MarkLevel | null;
};

type Round = { index: number; marks: Record<string, MarkLevel>; finished: boolean };
type Action = { type: "next"; total: number } | { type: "mark"; key: string; level: MarkLevel };

function reduce(state: Round, action: Action): Round {
  if (action.type === "mark") return { ...state, marks: { ...state.marks, [action.key]: action.level } };
  if (state.index + 1 >= action.total) return { ...state, finished: true };
  return { ...state, index: state.index + 1 };
}

const INTERACTIVE = "button, a, input, textarea, select, summary";

function Step(props: {
  question: QuickFireQuestion;
  position: number;
  total: number;
  level: MarkLevel | null;
  opportunityId: string | null;
  scope: MarkScope;
  onNext: () => void;
  onMarked: (level: MarkLevel) => void;
}) {
  const { question } = props;
  const announce = useAnnounce();
  const { remaining, done } = useCountdown(QUICK_FIRE_SECONDS, true);
  const revealed = done;
  const spineRef = React.useRef<HTMLDivElement>(null);
  const { mark, pending } = useMark({
    questionKey: question.questionKey,
    opportunityId: props.opportunityId,
    scope: props.scope,
    onMarked: props.onMarked,
  });

  // One polite line per question when the count starts.
  React.useEffect(() => {
    announce(PREP_COPY.quickFire.countdownAnnounce);
  }, [announce, question.questionKey]);

  // The Spine is the content: move focus to it so a screen reader reads it.
  React.useEffect(() => {
    if (revealed) spineRef.current?.focus();
  }, [revealed]);

  const { onNext } = props;
  React.useEffect(() => {
    if (!revealed) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      const target = event.target instanceof Element ? event.target : null;
      if (target?.closest(INTERACTIVE)) return;
      if (event.key === " " || event.key === "Enter") {
        event.preventDefault();
        onNext();
        return;
      }
      const at = ["1", "2", "3"].indexOf(event.key);
      if (at !== -1 && !pending) mark(MARK_LEVELS[at]);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [revealed, onNext, mark, pending]);

  function onSurfaceClick(event: React.MouseEvent) {
    if (!revealed) return;
    if (event.target instanceof Element && event.target.closest(INTERACTIVE)) return;
    onNext();
  }

  return (
    // The surface is a pointer convenience only; keyboard and screen reader
    // users have the window key handler and the Next button.
    <div
      data-testid="quick-fire-surface"
      onClick={onSurfaceClick}
      className="flex min-h-80 flex-col gap-6 rounded-xl bg-card p-6 ring-1 ring-foreground/10"
    >
      <p className="text-sm text-muted-foreground">{quickFireProgress(props.position, props.total)}</p>
      <p className="break-words text-xl font-semibold text-foreground">{question.question}</p>
      {revealed ? (
        <div className="flex flex-1 flex-col gap-4">
          <div
            ref={spineRef}
            tabIndex={-1}
            className="flex flex-col gap-1 rounded-lg bg-muted p-4 outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <p className="text-xs font-medium text-muted-foreground">{PREP_COPY.quickFire.spineLabel}</p>
            <p className="whitespace-pre-line break-words text-base text-foreground">{question.spine}</p>
          </div>
          <MarkButtons
            questionKey={question.questionKey}
            opportunityId={props.opportunityId}
            scope={props.scope}
            current={props.level}
            onMarked={props.onMarked}
          />
          <div className="mt-auto flex flex-wrap items-center gap-3">
            <Button type="button" onClick={props.onNext}>
              {PREP_COPY.quickFire.next}
            </Button>
            <p className="text-xs text-muted-foreground">{PREP_COPY.quickFire.keysHint}</p>
          </div>
        </div>
      ) : (
        // Digits only: nothing animates, and the live region above carries the
        // one announcement, so the ticking is not read out.
        <p aria-hidden="true" data-testid="quick-fire-count" className="text-5xl font-semibold tabular-nums text-foreground">
          {remaining}
        </p>
      )}
    </div>
  );
}

function Summary(props: {
  sessionId: string;
  questions: QuickFireQuestion[];
  marks: Record<string, MarkLevel>;
  backHref: string;
  backLabel: string;
}) {
  const ended = React.useRef(false);
  const { sessionId, questions, marks } = props;

  React.useEffect(() => {
    if (ended.current) return;
    ended.current = true;
    const given = questions.filter((q) => marks[q.questionKey] !== undefined);
    const solid = given.filter((q) => marks[q.questionKey] === "solid").length;
    endSessionAction({ id: sessionId, seen: questions.length, marked: given.length, solid })
      .then((result) => {
        if (!result.ok) toast.error(result.message);
      })
      .catch((error) => {
        console.error("end session failed", error);
        toast.error(PREP_COPY.quickFire.sessionEndFailed);
      });
  }, [sessionId, questions, marks]);

  return (
    <section className="flex flex-col gap-4 rounded-xl bg-card p-6 ring-1 ring-foreground/10">
      <h2 className="text-lg font-semibold text-foreground">{PREP_COPY.quickFire.summaryHeading}</h2>
      <ul className="flex flex-col divide-y divide-border">
        {questions.map((q) => {
          const level = marks[q.questionKey] ?? null;
          return (
            <li key={q.questionKey} className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1 py-2">
              <p className="min-w-0 flex-1 break-words text-sm text-foreground">
                {q.number === undefined ? null : <span className="text-muted-foreground">{q.number}. </span>}
                {q.question}
              </p>
              {level ? <MarkChip level={level} /> : <span className="text-xs text-muted-foreground">{PREP_COPY.quickFire.noMark}</span>}
            </li>
          );
        })}
      </ul>
      <Link href={props.backHref} className={cn(buttonVariants({ variant: "outline" }), "w-fit")}>
        {props.backLabel}
      </Link>
    </section>
  );
}

export function QuickFireCard(props: {
  questions: QuickFireQuestion[];
  sessionId: string;
  // null for a library round: it has no job, so its marks use scope "library".
  opportunityId: string | null;
  backHref: string;
  scope?: MarkScope;
  backLabel?: string;
  emptyTitle?: string;
}): React.ReactElement {
  const scope = props.scope ?? "job";
  const [round, dispatch] = React.useReducer(reduce, { index: 0, marks: {}, finished: false });
  const total = props.questions.length;
  const next = React.useCallback(() => dispatch({ type: "next", total }), [total]);

  if (total === 0) {
    return <EmptyState size="panel" title={props.emptyTitle ?? PREP_COPY.quickFireEmpty} />;
  }
  if (round.finished) {
    return <Summary sessionId={props.sessionId} questions={props.questions} marks={round.marks}
        backHref={props.backHref}
        backLabel={props.backLabel ?? PREP_COPY.quickFire.back}
      />;
  }

  const question = props.questions[round.index];
  return (
    <Step
      key={question.questionKey}
      question={question}
      position={round.index + 1}
      total={total}
      level={round.marks[question.questionKey] ?? question.level}
      opportunityId={props.opportunityId}
      scope={scope}
      onNext={next}
      onMarked={(level) => dispatch({ type: "mark", key: question.questionKey, level })}
    />
  );
}
