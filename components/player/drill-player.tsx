"use client";

import * as React from "react";
import Link from "next/link";

import { startSessionAction } from "@/app/(app)/jobs/[slug]/prep-actions";
import { DrillSummary } from "@/components/player/drill-summary";
import { DrillTimer } from "@/components/player/drill-timer";
import { RecordControl, RecordedPanel, useAnswerRecorder, type MediaEnv, type UploadInput, type UploadResult } from "@/components/player/record-answer";
import { useSpeaker, type BrowserVoices } from "@/components/player/speaker";
import { useMark } from "@/components/prep/mark-buttons";
import { EmptyState } from "@/components/super-ai/empty-state";
import { Button, buttonVariants } from "@/components/ui/button";
import { LIBRARY_COPY } from "@/lib/library/copy";
import type { DrillQuestion } from "@/lib/prep/drill";
import type { PlaybackStep } from "@/lib/prep/plan";
import { summarizeDrill } from "@/lib/prep/drill-summary";
import { drillReducer, initialDrillState, keyToLevel } from "@/lib/prep/drill-state";
import { PREP_COPY } from "@/lib/prep/copy";
import { MARK_LEVELS, type MarkLevel, type MarkScope } from "@/lib/prep/values";
import type { Result } from "@/lib/result";
import { cn } from "@/lib/utils";

type LibraryClips = { askAssetId: string | null; sayAssetId: string | null };

// A step with the clip an on-demand call produced, when it has none of its own.
function withClip(step: PlaybackStep, assetId: string | null | undefined): PlaybackStep {
  return step.clip !== null || !assetId ? step : { ...step, clip: { assetId, suspect: false } };
}

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

function Gap(props: { remaining: number; onDone(): void; onMoreTime(): void; record: React.ReactNode }): React.ReactElement {
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
      {props.record}
      <p className="text-center text-xs text-muted-foreground">{copy.keysHint}</p>
    </div>
  );
}

function Reveal(props: {
  question: DrillQuestion;
  opportunityId: string | null;
  scope: MarkScope;
  onMark(level: MarkLevel): void;
  onSkip(): void;
  onReplay(): void;
  record: React.ReactNode;
}): React.ReactElement {
  const { question } = props;
  const copy = PREP_COPY.drill;
  const spineRef = React.useRef<HTMLDivElement>(null);
  const { mark, pending } = useMark({
    questionKey: question.questionKey,
    opportunityId: props.opportunityId,
    scope: props.scope,
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

      {props.record}

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

/** One question's gap and reveal. Keyed by the question, so a recording never outlives it. */
function QuestionStage(props: {
  question: DrillQuestion;
  phase: "gap" | "reveal";
  remaining: number;
  opportunityId: string | null;
  scope: MarkScope;
  sessionId: string | null;
  refused: boolean;
  onRefused(): void;
  media?: MediaEnv;
  upload?: (input: UploadInput) => Promise<UploadResult>;
  dispatch(event: Parameters<typeof drillReducer>[1]): void;
  onReplay(): void;
}): React.ReactElement {
  const { question, phase, dispatch } = props;
  const recorder = useAnswerRecorder({
    phase,
    // A recording belongs to a job; a library drill never offers one.
    opportunityId: props.opportunityId ?? "",
    sessionId: props.sessionId,
    questionKey: question.questionKey,
    refused: props.refused,
    onRefused: props.onRefused,
    env: props.media,
    upload: props.upload,
  });
  const canRecord = props.scope === "job";
  return phase === "gap" ? (
    <Gap
      remaining={props.remaining}
      onDone={() => dispatch({ type: "done" })}
      onMoreTime={() => dispatch({ type: "more_time" })}
      record={canRecord ? <RecordControl recorder={recorder} /> : null}
    />
  ) : (
    <Reveal
      question={question}
      opportunityId={props.opportunityId}
      scope={props.scope}
      onMark={(level) => dispatch({ type: "mark", level })}
      onSkip={() => dispatch({ type: "skip" })}
      onReplay={props.onReplay}
      record={canRecord ? <RecordedPanel recorder={recorder} /> : null}
    />
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
  // null for the Library's drill: no job, marks in scope "library".
  opportunityId: string | null;
  slug: string | null;
  docRef: string | null;
  speed: number;
  browserVoices: BrowserVoices;
  scope?: MarkScope;
  // Asks for the clips of the next questions (the Library generates them on
  // demand). Until a clip exists a step speaks through the browser voice.
  ensureAudio?: (questionKeys: string[]) => Promise<Result<{ clips: Record<string, LibraryClips> }, string>>;
  // Test seams for the microphone; the browser's own APIs by default.
  media?: MediaEnv;
  upload?: (input: UploadInput) => Promise<UploadResult>;
}): React.ReactElement {
  const { questions, speed } = props;
  const scope = props.scope ?? "job";
  const copy = PREP_COPY.drill;
  const backHref = scope === "library" ? "/library" : `/jobs/${props.slug}?tab=prep`;
  const backLabel = scope === "library" ? LIBRARY_COPY.back : copy.back;
  const [state, dispatch] = React.useReducer(
    (current: ReturnType<typeof initialDrillState>, event: Parameters<typeof drillReducer>[1]) => drillReducer(current, event, questions),
    undefined,
    initialDrillState,
  );
  const [started, setStarted] = React.useState(false);
  const [replays, setReplays] = React.useState(0);
  const [sessionId, setSessionId] = React.useState<string | null>(null);
  // A refused microphone hides Record my answer for the rest of the session.
  const [micRefused, setMicRefused] = React.useState(false);
  const onRefused = React.useCallback(() => setMicRefused(true), []);
  // Clips made on demand while the drill runs. The ref is what the speaking
  // effects read, so a clip arriving mid-question never restarts the speech.
  const [clips, setClips] = React.useState<Record<string, LibraryClips>>({});
  const clipsRef = React.useRef(clips);
  React.useEffect(() => {
    clipsRef.current = clips;
  }, [clips]);
  const speaker = useSpeaker({ browserVoices: props.browserVoices });
  const { speak, cancel } = speaker;
  const sessionStarted = React.useRef(false);
  const total = questions.length;
  const question = questions[state.index] ?? null;
  const { phase, index } = state;

  // The Library's clips are made on demand: the first two questions on mount
  // (no sound is made), then the two after the current one at each step.
  const { ensureAudio } = props;
  const requested = React.useRef(new Set<string>());
  React.useEffect(() => {
    if (!ensureAudio) return;
    const wanted = (index === 0 ? questions.slice(0, 2) : questions.slice(index + 1, index + 3))
      .map((q) => q.questionKey)
      .filter((key) => !requested.current.has(key));
    if (wanted.length === 0) return;
    for (const key of wanted) requested.current.add(key);
    ensureAudio(wanted)
      .then((result) => {
        if (result.ok) setClips((current) => ({ ...current, ...result.data.clips }));
      })
      .catch((error) => console.error("ensure audio failed", error));
  }, [ensureAudio, questions, index]);

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
    void speak(withClip(question.ask, clipsRef.current[question.questionKey]?.askAssetId), speed).then((outcome) => {
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
        const outcome = await speak(withClip(step, clipsRef.current[question.questionKey]?.sayAssetId), speed);
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
    return (
      <DrillSummary
        summary={summary}
        scope={scope}
        slug={props.slug}
        docRef={props.docRef}
        sessionId={sessionId}
        seen={total}
        opportunityId={props.opportunityId}
      />
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-start justify-between gap-3">
        <p aria-live="polite" className="text-sm text-muted-foreground">
          {copy.positionOf(index + 1, total)}
          {question.section ? ` · ${question.section}` : ""}
        </p>
        <Link href={backHref} className={buttonVariants({ variant: "ghost", size: "sm" })}>
          {backLabel}
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

        {started && (phase === "gap" || phase === "reveal") ? (
          <QuestionStage
            key={question.questionKey}
            question={question}
            phase={phase}
            remaining={state.remaining}
            opportunityId={props.opportunityId}
            scope={scope}
            sessionId={sessionId}
            refused={micRefused}
            onRefused={onRefused}
            media={props.media}
            upload={props.upload}
            dispatch={dispatch}
            onReplay={() => setReplays((n) => n + 1)}
          />
        ) : null}
      </div>
    </div>
  );
}
