"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { scoreFitAction } from "@/app/(app)/jobs/[slug]/actions";
import { FitResultBody } from "@/components/fit/fit-result-body";
import { FIT_LINK_CLASS, HardFilterLines } from "@/components/fit/hard-filter-lines";
import { useAnnounce } from "@/components/live-announcer";
import { LocalTime } from "@/components/local-time";
import { Button } from "@/components/ui/button";
import { FIT_PENDING_STALE_MS, FIT_POLL_MAX, FIT_POLL_MS, type FitCardModel } from "@/lib/fit/card";
import { FIT_MESSAGES, scoreFailureToast, scoredAnnouncement } from "@/lib/fit/messages";
import { correctFocusOnceLost } from "@/lib/dom/focus";
import { messageFor } from "@/lib/pipeline/messages";

function buttonLabel(view: FitCardModel["view"]): string | null {
  if (view === "none") return FIT_MESSAGES.scoreThisJob;
  if (view === "failed" || view === "stalled") return FIT_MESSAGES.tryAgain;
  if (view === "done") return FIT_MESSAGES.scoreAgain;
  return null;
}

export function FitCard({ model }: { model: FitCardModel }) {
  const headingId = React.useId();
  const router = useRouter();
  const announce = useAnnounce();
  const [isScoring, startScoring] = React.useTransition();
  const buttonRef = React.useRef<HTMLButtonElement>(null);
  // Kept outside the effect so a re-run of it (the router object changing)
  // cannot hand a stuck run a fresh budget of refreshes. It starts over
  // only once the view leaves `pending`.
  const refreshesRef = React.useRef(0);

  React.useEffect(() => {
    if (model.view !== "pending") {
      refreshesRef.current = 0;
      return;
    }
    let lastRefresh: number | undefined;
    const timer = window.setInterval(() => {
      if (refreshesRef.current >= FIT_POLL_MAX) {
        window.clearInterval(timer);
        // Staleness is measured from the row's last write, and an unrelated
        // write while the run was pending moves it forward. One more look
        // once the stale window has passed turns a lost run into a retry.
        lastRefresh = window.setTimeout(() => router.refresh(), FIT_PENDING_STALE_MS);
        return;
      }
      refreshesRef.current += 1;
      router.refresh();
    }, FIT_POLL_MS);
    return () => {
      window.clearInterval(timer);
      window.clearTimeout(lastRefresh);
    };
  }, [model.view, router]);

  // A run that finishes while the card is open arrives as a new model, not as
  // a click, so the button path's announcement does not cover it.
  const previousViewRef = React.useRef(model.view);
  React.useEffect(() => {
    const previous = previousViewRef.current;
    previousViewRef.current = model.view;
    if (previous !== "pending") return;
    if (model.view === "done" && model.fit) announce(scoredAnnouncement(model, model.fit.score));
    else if (model.view === "failed") announce(FIT_MESSAGES.failed);
  }, [model, announce]);

  function score() {
    startScoring(async () => {
      try {
        const result = await scoreFitAction(model.opportunityId);
        if (!result.ok) {
          toast.error(scoreFailureToast(result.message));
          return;
        }
        const run = result.data;
        if (run.status === "done" && run.score !== null) announce(scoredAnnouncement(model, run.score));
        else announce(run.status === "failed" ? FIT_MESSAGES.failed : FIT_MESSAGES.none);
      } catch (error) {
        // The action can reject before it returns a Result, for example when
        // the session lookup cannot reach the database.
        console.error("score failed", error);
        toast.error(scoreFailureToast(messageFor("unexpected")));
      } finally {
        // The button is disabled while the action runs, and Chromium moves
        // focus to <body> when a focused button becomes disabled.
        correctFocusOnceLost(() => buttonRef.current?.focus());
      }
    });
  }

  const { fit, hardFilters } = model;
  const canScore = model.readiness === "ready";
  const label = buttonLabel(model.view);
  const showReason = model.view !== "pending" && !canScore;
  // The same missing resume reads differently above a score that already exists.
  const reasonKey =
    model.readiness === "no_resume" && fit ? "no_resume_again" : (model.readiness as "ai_off" | "no_posting" | "no_resume");

  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-3">
      <h2 id={headingId} className="text-base font-semibold text-foreground">
        {FIT_MESSAGES.heading}
      </h2>

      {fit && model.view !== "none" ? (
        <>
          <FitResultBody fit={fit} threshold={model.threshold} headingLevel="h3" />
          <p className="text-sm text-muted-foreground">
            Scored <LocalTime value={fit.scoredAt} mode="datetime" /> by {fit.modelId}.
          </p>
          {model.profileChangedSince ? (
            <p className="text-sm text-muted-foreground">{FIT_MESSAGES.changed}</p>
          ) : null}
        </>
      ) : null}
      {model.view === "failed" || model.view === "stalled" || model.view === "none" ? (
        <p className="text-sm text-muted-foreground">{FIT_MESSAGES[model.view]}</p>
      ) : null}

      {/* Always in the document, so a screen reader hears the line when it
          appears; empty unless a run is in flight. */}
      <p role="status" className="text-sm text-muted-foreground">
        {model.view === "pending" || isScoring ? FIT_MESSAGES.pending : null}
      </p>

      {showReason ? (
        <p className="text-sm text-muted-foreground">
          {FIT_MESSAGES[reasonKey]}
          {model.readiness === "no_resume" ? (
            <>
              {" "}
              <Link href="/settings" className={FIT_LINK_CLASS}>
                {FIT_MESSAGES.openSettings}
              </Link>
            </>
          ) : null}
        </p>
      ) : null}

      {label && canScore ? (
        <div>
          <Button ref={buttonRef} variant="outline" size="sm" disabled={isScoring} onClick={score}>
            {label}
          </Button>
        </div>
      ) : null}

      <HardFilterLines hardFilters={hardFilters} hasHardFilters={model.hasHardFilters} headingLevel="h3" />
    </section>
  );
}
