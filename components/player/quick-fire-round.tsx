"use client";

import * as React from "react";

import { startSessionAction } from "@/app/(app)/jobs/[slug]/prep-actions";
import { QuickFireCard, type QuickFireQuestion } from "@/components/player/quick-fire-card";
import { EmptyState } from "@/components/super-ai/empty-state";
import { Button } from "@/components/ui/button";
import { PREP_COPY } from "@/lib/prep/copy";
import { pickQuickFire, QUICK_FIRE_COUNT, seedFromId } from "@/lib/prep/quick-fire";
import { messageFor } from "@/lib/pipeline/messages";

type Phase =
  | { kind: "starting" }
  | { kind: "ready"; sessionId: string; picked: QuickFireQuestion[] }
  | { kind: "failed"; message: string };

/**
 * The round's client shell. The page creates no session: this starts one on
 * mount, and the order of the round comes from that session's id, so the same
 * id always gives the same ten questions.
 */
export function QuickFireRound(props: {
  questions: QuickFireQuestion[];
  opportunityId: string;
  backHref: string;
}): React.ReactElement {
  const { questions, opportunityId } = props;
  const [phase, setPhase] = React.useState<Phase>({ kind: "starting" });
  const started = React.useRef(false);

  const start = React.useCallback(async () => {
    const planned = Math.min(QUICK_FIRE_COUNT, questions.length);
    try {
      const result = await startSessionAction({ opportunityId, mode: "quick_fire", questions: planned });
      if (!result.ok) {
        setPhase({ kind: "failed", message: result.message });
        return;
      }
      const picked = pickQuickFire(questions, seedFromId(result.data.id), QUICK_FIRE_COUNT);
      setPhase({ kind: "ready", sessionId: result.data.id, picked });
    } catch (error) {
      console.error("start session failed", error);
      setPhase({ kind: "failed", message: `${PREP_COPY.quickFire.startFailed} ${messageFor("unexpected")}` });
    }
  }, [opportunityId, questions]);

  React.useEffect(() => {
    // One session per visit, also under Strict Mode's second effect run.
    if (started.current || questions.length === 0) return;
    started.current = true;
    void start();
  }, [start, questions.length]);

  if (questions.length === 0) {
    return <EmptyState size="panel" title={PREP_COPY.quickFireEmpty} />;
  }
  if (phase.kind === "failed") {
    return (
      <div role="alert" className="flex flex-col items-start gap-3 rounded-lg border border-border bg-muted p-4 text-sm">
        <p className="break-words text-foreground">{phase.message}</p>
        <Button
          type="button"
          variant="outline"
          onClick={() => {
            setPhase({ kind: "starting" });
            void start();
          }}
        >
          {PREP_COPY.quickFire.retry}
        </Button>
      </div>
    );
  }
  if (phase.kind === "starting") {
    return <p className="text-sm text-muted-foreground">{PREP_COPY.quickFire.starting}</p>;
  }
  return (
    <QuickFireCard
      questions={phase.picked}
      sessionId={phase.sessionId}
      opportunityId={opportunityId}
      backHref={props.backHref}
    />
  );
}
