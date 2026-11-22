"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { regenerateClipAction } from "@/app/(app)/jobs/[slug]/audio-actions";
import { useAnnounce } from "@/components/live-announcer";
import { usePlaybackEngine } from "@/components/player/engine";
import { useMediaSession } from "@/components/player/media-session";
import { PlayerControls } from "@/components/player/player-controls";
import { Transcript } from "@/components/player/transcript";
import { SaveToLibraryButton } from "@/components/library/save-to-library-button";
import { MarkButtons } from "@/components/prep/mark-buttons";
import { buttonVariants } from "@/components/ui/button";
import { messageFor } from "@/lib/pipeline/messages";
import { PREP_COPY } from "@/lib/prep/copy";
import type { PlaybackPlan } from "@/lib/prep/plan";
import type { BrowserVoices } from "@/components/player/speaker";
import type { MarkLevel } from "@/lib/prep/values";

/**
 * The Listen screen's client shell: the engine, the Media Session, the header,
 * the controls, the transcript and the always-visible mark buttons. Marking
 * writes through markQuestionAction and never touches the engine.
 */
export function ListenPlayer(props: {
  plan: PlaybackPlan;
  kind: "bank" | "pitch";
  opportunityId: string;
  speed: number;
  gapFactor: number;
  browserVoices: BrowserVoices;
  initialStepIndex: number;
  backHref: string;
}): React.ReactElement {
  const { plan, kind } = props;
  const copy = PREP_COPY.listen;
  const router = useRouter();
  const announce = useAnnounce();
  const chapters = kind === "pitch";
  const [levels, setLevels] = React.useState<Record<string, MarkLevel>>({});
  const [noticeDismissed, setNoticeDismissed] = React.useState(false);
  const [regenerating, setRegenerating] = React.useState(false);

  const { state, currentStep, currentQuestionIndex, dispatch } = usePlaybackEngine(plan, {
    speed: props.speed,
    gapFactor: props.gapFactor,
    browserVoices: props.browserVoices,
    initialStepIndex: props.initialStepIndex,
  });
  const running = state.status === "playing" || state.status === "gap";
  const question = plan.questions[currentQuestionIndex] ?? null;

  const play = React.useCallback(() => {
    setNoticeDismissed(true);
    dispatch({ type: "play" });
  }, [dispatch]);
  const pause = React.useCallback(() => dispatch({ type: "pause" }), [dispatch]);
  const previous = React.useCallback(() => dispatch({ type: "prev_question" }), [dispatch]);
  const next = React.useCallback(() => dispatch({ type: "next_question" }), [dispatch]);

  const { backgroundStopped } = useMediaSession({
    title: plan.title,
    artist: plan.subtitle,
    artworkUrl: "/brand/mark.svg",
    onPlay: play,
    onPause: pause,
    onPrevious: previous,
    onNext: next,
    active: running,
  });

  async function regenerate(hashes: string[]) {
    setRegenerating(true);
    try {
      for (const hash of hashes) {
        const result = await regenerateClipAction(props.opportunityId, hash);
        if (!result.ok) {
          toast.error(result.message);
          return;
        }
      }
      announce(copy.regenerated);
      router.refresh();
    } catch (error) {
      console.error("regenerate clip failed", error);
      toast.error(`${copy.regenerateFailed} ${messageFor("unexpected")}`);
    } finally {
      setRegenerating(false);
    }
  }

  const position = (chapters ? copy.chapterOf : copy.questionOf)(currentQuestionIndex + 1, plan.questions.length);
  const level = question ? (levels[question.questionKey] ?? question.level) : null;

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col">
      <header className="sticky top-0 z-10 flex flex-col gap-3 border-b border-border bg-background px-4 py-3 sm:px-6">
        <div className="flex min-w-0 items-start justify-between gap-3">
          <div className="flex min-w-0 flex-col">
            <h1 className="break-words text-sm font-medium text-muted-foreground">{plan.title}</h1>
            <p aria-live="polite" className="text-base font-semibold text-foreground">
              {position}
            </p>
            {question?.section ? <p className="break-words text-sm text-muted-foreground">{question.section}</p> : null}
          </div>
          <Link href={props.backHref} className={buttonVariants({ variant: "ghost", size: "sm" })}>
            {copy.back}
          </Link>
        </div>
        <PlayerControls
          playing={running}
          speed={state.speed}
          chapters={chapters}
          onPlay={play}
          onPause={pause}
          onPrevious={previous}
          onNext={next}
          onRepeat={() => dispatch({ type: "repeat_question" })}
          onSpeed={(speed) => dispatch({ type: "set_speed", speed })}
        />
      </header>

      {/* The app shell already provides the page's one main landmark. */}
      <div className="flex flex-1 flex-col gap-4 px-4 py-4 sm:px-6">
        {backgroundStopped && !noticeDismissed ? (
          <p role="status" className="rounded-lg border border-border bg-muted p-3 text-sm text-foreground">
            {copy.backgroundStopped}
          </p>
        ) : null}
        {state.status === "ended" ? (
          <p role="status" className="text-sm text-muted-foreground">
            {copy.ended}
          </p>
        ) : null}
        <Transcript
          plan={plan}
          questionIndex={currentQuestionIndex}
          currentStepIndex={currentStep ? state.stepIndex : -1}
          onSeek={(stepIndex) => dispatch({ type: "seek_step", stepIndex })}
          onRegenerate={regenerate}
          regenerating={regenerating}
        />
      </div>

      {!chapters && question ? (
        <footer className="sticky bottom-0 z-10 flex flex-col gap-2 border-t border-border bg-background px-4 py-3 sm:px-6">
          <MarkButtons
            key={question.questionKey}
            questionKey={question.questionKey}
            opportunityId={props.opportunityId}
            scope="job"
            current={level}
            drilled={false}
            onMarked={(marked) => setLevels((prev) => ({ ...prev, [question.questionKey]: marked }))}
          />
          <div>
            <SaveToLibraryButton
              key={question.questionKey}
              opportunityId={props.opportunityId}
              questionKey={question.questionKey}
              questionLabel={question.question}
            />
          </div>
        </footer>
      ) : null}
    </div>
  );
}
