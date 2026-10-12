"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { scoreFitAction } from "@/app/(app)/jobs/[slug]/actions";
import { FitChip } from "@/components/fit/fit-chip";
import { useAnnounce } from "@/components/live-announcer";
import { LocalTime } from "@/components/local-time";
import { Button } from "@/components/ui/button";
import { FIT_POLL_MAX, FIT_POLL_MS, type FitCardModel } from "@/lib/fit/card";
import {
  FIT_MESSAGES,
  missesFiltersLine,
  scoreFailureToast,
  scoredAnnouncement,
  thresholdLine,
  uncheckedFiltersLine,
} from "@/lib/fit/messages";
import { correctFocusOnceLost } from "@/lib/dom/focus";
import { messageFor } from "@/lib/pipeline/messages";

// Underlined at rest: a link inside a line of muted text must differ from the
// text by more than color (axe link-in-text-block).
const LINK_CLASS = "text-foreground underline underline-offset-4";

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
    const timer = window.setInterval(() => {
      if (refreshesRef.current >= FIT_POLL_MAX) {
        window.clearInterval(timer);
        return;
      }
      refreshesRef.current += 1;
      router.refresh();
    }, FIT_POLL_MS);
    return () => window.clearInterval(timer);
  }, [model.view, router]);

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

  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-3">
      <h2 id={headingId} className="text-base font-semibold text-foreground">
        {FIT_MESSAGES.heading}
      </h2>

      {model.view === "done" && fit ? (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <FitChip score={fit.score} />
            <p className="text-sm text-muted-foreground">{thresholdLine(fit.score, model.threshold)}</p>
          </div>
          <p className="break-words text-foreground">{fit.summary}</p>
          {fit.pros.length > 0 ? (
            <div className="flex flex-col gap-1">
              <h3 className="text-sm font-medium text-foreground">{FIT_MESSAGES.whyItFits}</h3>
              <ul className="list-disc pl-5 text-sm text-foreground">
                {fit.pros.map((pro, index) => (
                  <li key={index} className="break-words">
                    {pro}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {fit.cons.length > 0 ? (
            <div className="flex flex-col gap-1">
              <h3 className="text-sm font-medium text-foreground">{FIT_MESSAGES.mayNotFit}</h3>
              <ul className="list-disc pl-5 text-sm text-foreground">
                {fit.cons.map((con, index) => (
                  <li key={index} className="break-words">
                    {con}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          <p className="text-sm text-muted-foreground">
            Scored <LocalTime value={fit.scoredAt} mode="datetime" /> by {fit.modelId}.
          </p>
          {model.profileChangedSince ? (
            <p className="text-sm text-muted-foreground">{FIT_MESSAGES.changed}</p>
          ) : null}
        </>
      ) : model.view !== "pending" ? (
        <p className="text-sm text-muted-foreground">{FIT_MESSAGES[model.view === "done" ? "none" : model.view]}</p>
      ) : null}

      {/* Always in the document, so a screen reader hears the line when it
          appears; empty unless a run is in flight. */}
      <p role="status" className="text-sm text-muted-foreground">
        {model.view === "pending" || isScoring ? FIT_MESSAGES.pending : null}
      </p>

      {showReason ? (
        <p className="text-sm text-muted-foreground">
          {FIT_MESSAGES[model.readiness as "ai_off" | "no_posting" | "no_resume"]}
          {model.readiness === "no_resume" ? (
            <>
              {" "}
              <Link href="/settings" className={LINK_CLASS}>
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

      <div className="flex flex-col gap-1">
        <h3 className="text-sm font-medium text-foreground">{FIT_MESSAGES.hardFilters}</h3>
        {model.hasHardFilters ? (
          <>
            <p className="text-sm text-foreground">
              {hardFilters.failed.length > 0 ? missesFiltersLine(hardFilters.failed) : FIT_MESSAGES.passes}
            </p>
            {hardFilters.unchecked.length > 0 ? (
              <p className="text-sm text-muted-foreground">{uncheckedFiltersLine(hardFilters.unchecked)}</p>
            ) : null}
          </>
        ) : (
          <p className="text-sm text-muted-foreground">
            {FIT_MESSAGES.noFiltersSet}{" "}
            <Link href="/preferences" className={LINK_CLASS}>
              {FIT_MESSAGES.setPreferences}
            </Link>
          </p>
        )}
      </div>
    </section>
  );
}
