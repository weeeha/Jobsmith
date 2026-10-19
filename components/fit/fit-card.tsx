"use client";

import * as React from "react";
import Link from "next/link";
import { toast } from "sonner";

import { scoreFitAction } from "@/app/(app)/jobs/[slug]/actions";
import { FitFrame, FitResult } from "@/components/fit/fit-result";
import { useScoringRefresh } from "@/components/fit/use-scoring-refresh";
import { useAnnounce } from "@/components/live-announcer";
import { Button, buttonVariants } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { FIT_BAND_WORDS } from "@/lib/fit/bands";
import type { FitCardModel, FitCardView } from "@/lib/fit/card";
import { FIT_MESSAGES } from "@/lib/fit/messages";
import { focusWasLost } from "@/lib/dom/focus";

const RUN_FAILED = "Could not score this job. Try again.";

/** The scoring state: the drafts' line beside the heading and two placeholder bars. */
function Scoring({ frameRef }: { frameRef: React.Ref<HTMLElement> }) {
  return (
    <FitFrame
      ref={frameRef}
      level={2}
      headerExtra={
        <span role="status" className="text-xs text-muted-foreground">
          {FIT_MESSAGES.scoring}
        </span>
      }
    >
      <div className="flex flex-col gap-2" aria-hidden="true">
        <Skeleton className="h-3 w-3/4 rounded-full" />
        <Skeleton className="h-3 w-1/2 rounded-full" />
      </div>
    </FitFrame>
  );
}

function Message({
  frameRef,
  text,
  action,
}: {
  frameRef: React.Ref<HTMLElement>;
  text: string;
  action?: React.ReactNode;
}) {
  return (
    <FitFrame ref={frameRef} level={2}>
      <p className="text-muted-foreground">{text}</p>
      {action ? <div>{action}</div> : null}
    </FitFrame>
  );
}

/**
 * The fit card on a job's Overview. While a run is pending (the one queued
 * when the job was added) it refreshes the page on a timer, up to a cap; the
 * card's own button awaits its run and shows the scoring state meanwhile.
 */
export function FitCard({ model }: { model: FitCardModel }) {
  const announce = useAnnounce();
  const [running, startTransition] = React.useTransition();
  const frameRef = React.useRef<HTMLElement>(null);
  const view: FitCardView = running ? "scoring" : model.view;

  useScoringRefresh(model.view === "scoring");

  // A result that arrives by refresh or by the button is announced once,
  // when the card's state changes to it.
  const previousView = React.useRef(model.view);
  React.useEffect(() => {
    const previous = previousView.current;
    previousView.current = model.view;
    if (previous === model.view) return;
    if (model.view === "scored" && model.fit && model.band) {
      announce(`Fit score ${model.fit.score}, ${FIT_BAND_WORDS[model.band]}.`);
    } else if (model.view === "failed") {
      announce(FIT_MESSAGES.failed);
    }
  }, [model.view, model.fit, model.band, announce]);

  // The pressed button is gone while the run shows the scoring state; when it
  // ends, focus goes to the card instead of the top of the page.
  const wasRunning = React.useRef(false);
  React.useEffect(() => {
    if (wasRunning.current && !running && focusWasLost()) frameRef.current?.focus();
    wasRunning.current = running;
  }, [running]);

  function score() {
    startTransition(async () => {
      try {
        const result = await scoreFitAction(model.opportunityId);
        if (!result.ok) toast.error(result.message);
      } catch (error) {
        console.error("score fit failed", error);
        toast.error(RUN_FAILED);
      }
    });
  }

  const scoreButton = (label: string) => (
    <Button variant="outline" onClick={score}>
      {label}
    </Button>
  );

  switch (view) {
    case "scored":
      return model.fit && model.band ? (
        <FitResult frameRef={frameRef} fit={model.fit} band={model.band} hardFilters={model.hardFilters} level={2} />
      ) : null;
    case "scoring":
      return <Scoring frameRef={frameRef} />;
    case "failed":
      return <Message frameRef={frameRef} text={FIT_MESSAGES.failed} action={scoreButton(FIT_MESSAGES.scoreAgain)} />;
    case "unscored":
      return <Message frameRef={frameRef} text={FIT_MESSAGES.none} action={scoreButton(FIT_MESSAGES.scoreThisJob)} />;
    case "no_resume":
      return (
        <Message
          frameRef={frameRef}
          text={FIT_MESSAGES.no_resume}
          action={
            <Link href="/settings" className={buttonVariants({ variant: "outline" })}>
              {FIT_MESSAGES.openSettings}
            </Link>
          }
        />
      );
    case "ai_off":
      return <Message frameRef={frameRef} text={FIT_MESSAGES.ai_off} />;
    case "no_posting":
      return <Message frameRef={frameRef} text={FIT_MESSAGES.no_posting} />;
  }
}
