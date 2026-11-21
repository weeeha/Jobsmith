"use client";

import * as React from "react";
import Link from "next/link";

import { startSessionAction } from "@/app/(app)/jobs/[slug]/prep-actions";
import { DrillSummary } from "@/components/player/drill-summary";
import { DrillTimer } from "@/components/player/drill-timer";
import { useSpeaker, type BrowserVoices } from "@/components/player/speaker";
import { useMark } from "@/components/prep/mark-buttons";
import { EmptyState } from "@/components/super-ai/empty-state";
import { Button, buttonVariants } from "@/components/ui/button";
import type { DrillQuestion } from "@/lib/prep/drill";
import { summarizeDrill } from "@/lib/prep/drill-summary";
import { drillReducer, initialDrillState, keyToLevel } from "@/lib/prep/drill-state";
import { PREP_COPY } from "@/lib/prep/copy";
import { MARK_LEVELS, type MarkLevel } from "@/lib/prep/values";
import { cn } from "@/lib/utils";

export type DrillSessionMeta = { order: string[]; docKey: string | null; section: string | null; onlyShaky: boolean };

// A key typed into a text field belongs to the field.
function inField(target: EventTarget | null): boolean {
  return target instanceof Element && target.closest("input, textarea, select, [contenteditable='true']") !== null;
}
function onControl(target: EventTarget | null): boolean {
  return target instanceof Element && target.closest("button, a, summary") !== null;
}

/** Calls `handler` for window key presses while mounted. */
function useWindowKeys(handler: (event: KeyboardEvent) => void) {
  const ref = React.useRef(handler);
  React.useEffect(() => {
    ref.current = handler;
  });
  React.useEffect(() => {
    const listener = (event: KeyboardEvent) => {
      if (event.ctrlKey || event.metaKey || event.altKey || inField(event.target)) return;
      ref.current(event);
    };
    window.addEventListener("keydown", listener);
    return () => window.removeEventListener("keydown", listener);
  }, []);
}

function Gap(props: { remaining: number; onDone(): void; onMoreTime(): void }): React.ReactElement {
  const copy = PREP_COPY.drill;
  useWindowKeys((event) => {
    // On a focused button, Space is that button's own click.
    if (event.key === " " && !onControl(event.target)) {
      event.preventDefault();
      props.onDone();
    }
  });
  return (
    <div className="flex flex-col items-center gap-6 py-4">
      <DrillTimer remaining={props.remaining} />
      <div className="flex flex-wrap justify-center gap-3">
        <Button type="button" size="lg" className="min-h-12 px-6 text-base" onClick={props.onDone}>
          {copy.done}
        </Button>
        <Button type="button" size="lg" variant="outline" className="min-h-12 px-6 text-base" onClick={props.onMoreTime}>
          {copy.moreTime}
        </Button>
      </div>
      <p className="text-center text-xs text-muted-foreground">{copy.keysHint}</p>
    </div>
  );
}

function Reveal(props: {
  question: DrillQuestion;
  opportunityId: string;
  onMark(level: MarkLevel): void;
  onSkip(): void;
  onReplay(): void;
}): React.ReactElement {
  const { question } = props;
  const copy = PREP_COPY.drill;
  const spineRef = React.useRef<HTMLDivElement>(null);
  const { mark, pending } = useMark({
    questionKey: question.questionKey,
    opportunityId: props.opportunityId,
    scope: "job",
    drilled: true,
    onMarked: props.onMark,
  });

  // The Spine is the first thing to read: send focus there so a screen reader starts on it.
  React.useEffect(() => {
    spineRef.current?.focus();
  }, []);

  useWindowKeys((event) => {
    const level = keyToLevel(event.key);
    if (level !== null) {
      if (!pending) mark(level);
      return;
    }
    if (event.key === "ArrowRight") {
      event.preventDefault();
      props.onSkip();
      return;
    }
    if (event.key === " " && !onControl(event.target)) {
      event.preventDefault();
      props.onReplay();
    }
  });

  const browserVoice = question.say.some((s) => s.clip === null);
  return (
    <div className="flex flex-col gap-4">
      {question.spine ? (
        <div
          ref={spineRef}
          tabIndex={-1}
          className="flex flex-col gap-1 rounded-lg bg-muted p-4 outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <p className="text-xs font-medium text-muted-foreground">{copy.spine}</p>
          <p className="whitespace-pre-line break-words text-base text-foreground">{question.spine}</p>
        </div>
      ) : (
        <div ref={spineRef} tabIndex={-1} className="outline-none" />
      )}

      <section aria-label={copy.reveal} className="flex flex-col gap-1 rounded-lg border border-border bg-card p-4">
        <p className="text-xs font-medium text-muted-foreground">{copy.say}</p>
        <p className="whitespace-pre-wrap break-words text-sm text-foreground">{question.sayText}</p>
        {browserVoice ? <p className="text-xs text-muted-foreground">{PREP_COPY.listen.browserVoice}</p> : null}
      </section>

      {question.lastLine ? (
        <div className="flex flex-col gap-1 rounded-lg border border-dashed border-border px-3 py-2">
          <span className="text-xs font-medium text-muted-foreground">{copy.lastLine}</span>
          <p className="whitespace-pre-wrap break-words text-sm text-muted-foreground">{question.lastLine}</p>
        </div>
      ) : null}
      {question.guard ? (
        <div className="flex flex-col gap-1 rounded-lg border border-dashed border-border px-3 py-2">
          <span className="text-xs font-medium text-muted-foreground">{copy.guard}</span>
          <p className="whitespace-pre-wrap break-words text-sm text-muted-foreground">{question.guard}</p>
        </div>
      ) : null}

      <div role="group" aria-label={PREP_COPY.hub.markGroup} className="grid grid-cols-3 gap-2">
        {MARK_LEVELS.map((level) => (
          <Button
            key={level}
            type="button"
            variant="outline"
            size="lg"
            disabled={pending}
            className="min-h-14 text-base"
            onClick={() => mark(level)}
          >
            {PREP_COPY.marks[level]}
          </Button>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Button type="button" variant="ghost" size="lg" className="min-h-11" onClick={props.onSkip}>
          {copy.skip}
        </Button>
        <Button type="button" variant="ghost" size="lg" className="min-h-11" onClick={props.onReplay}>
          {copy.replay}
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">{copy.keysHint}</p>
    </div>
  );
}

/**
 * The Drill screen's client shell. Pure state lives in drillReducer; this
 * speaks the steps, runs the one-second gap and starts the session. Nothing
 * makes a sound before the user presses Start, and a failed session start
 * leaves the drill running (the end call is then skipped).
 */
export function DrillPlayer(props: {
  questions: DrillQuestion[];
  sessionMeta: DrillSessionMeta;
  opportunityId: string;
  slug: string;
  docRef: string | null;
  speed: number;
  browserVoices: BrowserVoices;
}): React.ReactElement {
  const { questions, speed } = props;
  const copy = PREP_COPY.drill;
  const [state, dispatch] = React.useReducer(
    (current: ReturnType<typeof initialDrillState>, event: Parameters<typeof drillReducer>[1]) => drillReducer(current, event, questions),
    undefined,
    initialDrillState,
  );
  const [started, setStarted] = React.useState(false);
  const [replays, setReplays] = React.useState(0);
  const [sessionId, setSessionId] = React.useState<string | null>(null);
  const speaker = useSpeaker({ browserVoices: props.browserVoices });
  const { speak, cancel } = speaker;
  const sessionStarted = React.useRef(false);
  const total = questions.length;
  const question = questions[state.index] ?? null;
  const { phase, index } = state;

  // One session per visit, also under Strict Mode's second effect run.
  const { opportunityId, sessionMeta } = props;
  React.useEffect(() => {
    if (sessionStarted.current || total === 0) return;
    sessionStarted.current = true;
    startSessionAction({ opportunityId, mode: "drill", questions: total, meta: sessionMeta })
      .then((result) => {
        if (result.ok) setSessionId(result.data.id);
      })
      .catch((error) => console.error("start drill session failed", error));
  }, [opportunityId, sessionMeta, total]);

  // The interviewer asks; the question text appears once the asking is over.
  React.useEffect(() => {
    if (!started || phase !== "ask" || !question) return;
    let live = true;
    void speak(question.ask, speed).then((outcome) => {
      if (live && outcome !== "cancelled") dispatch({ type: "asked" });
    });
    return () => {
      live = false;
      cancel();
    };
  }, [started, phase, index, question, speed, speak, cancel]);

  // The silent gap: one tick a second.
  React.useEffect(() => {
    if (phase !== "gap") return;
    const id = window.setInterval(() => dispatch({ type: "tick" }), 1000);
    return () => window.clearInterval(id);
  }, [phase, index]);

  // The reveal plays the Say block in the candidate voice; Space plays it again.
  React.useEffect(() => {
    if (phase !== "reveal" || !question) return;
    let live = true;
    void (async () => {
      for (const step of question.say) {
        const outcome = await speak(step, speed);
        if (!live || outcome === "cancelled") return;
      }
    })();
    return () => {
      live = false;
      cancel();
    };
  }, [phase, index, question, replays, speed, speak, cancel]);

  const summary = React.useMemo(
    () => summarizeDrill(questions, state.given, state.skipped),
    [questions, state.given, state.skipped],
  );

  if (total === 0 || !question) {
    return <EmptyState size="panel" title={copy.empty} />;
  }

  if (phase === "summary") {
    return <DrillSummary summary={summary} slug={props.slug} docRef={props.docRef} sessionId={sessionId} seen={total} />;
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-start justify-between gap-3">
        <p aria-live="polite" className="text-sm text-muted-foreground">
          {copy.positionOf(index + 1, total)}
          {question.section ? ` · ${question.section}` : ""}
        </p>
        <Link href={`/jobs/${props.slug}?tab=prep`} className={buttonVariants({ variant: "ghost", size: "sm" })}>
          {copy.back}
        </Link>
      </div>

      <div className={cn("flex flex-col gap-4 rounded-xl bg-card p-5 ring-1 ring-foreground/10 sm:p-6")}>
        {!started ? (
          <div className="flex flex-col items-start gap-4">
            <p className="text-sm text-muted-foreground">{copy.startHint(total)}</p>
            <Button type="button" size="lg" className="min-h-12 px-6 text-base" onClick={() => setStarted(true)}>
              {copy.start}
            </Button>
          </div>
        ) : phase === "ask" ? (
          <p role="status" className="text-base text-muted-foreground">
            {copy.asking}
          </p>
        ) : (
          <p className="break-words text-xl font-semibold text-foreground">{question.question}</p>
        )}

        {started && phase === "gap" ? (
          <Gap
            remaining={state.remaining}
            onDone={() => dispatch({ type: "done" })}
            onMoreTime={() => dispatch({ type: "more_time" })}
          />
        ) : null}
        {started && phase === "reveal" ? (
          <Reveal
            key={question.questionKey}
            question={question}
            opportunityId={props.opportunityId}
            onMark={(level) => dispatch({ type: "mark", level })}
            onSkip={() => dispatch({ type: "skip" })}
            onReplay={() => setReplays((n) => n + 1)}
          />
        ) : null}
      </div>
    </div>
  );
}
