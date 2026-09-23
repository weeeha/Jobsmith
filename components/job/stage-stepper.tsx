"use client";

import * as React from "react";

import { Button } from "@/components/ui/button";
import { StageDetailSheet } from "@/components/job/stage-detail-sheet";
import { EditStagesDialog } from "@/components/job/edit-stages-dialog";
import { LocalTime } from "@/components/local-time";
import { STAGE_STATUS_WORDS } from "@/lib/pipeline/labels";
import { cn } from "@/lib/utils";
import type { StageControls } from "@/lib/pipeline/stage-controls";
import type { StageKind } from "@/lib/pipeline/kinds";
import type { OpportunityStatus, StageStatus, StageFormat } from "@/lib/pipeline/values";

type StepperStage = {
  id: string;
  kind: StageKind;
  label: string;
  status: StageStatus;
  scheduledAt: Date | null;
  completedAt: Date | null;
  format: StageFormat | null;
  outcomeMd: string | null;
};

interface StageStepperProps {
  opportunity: { id: string; roleTitle: string; status: OpportunityStatus };
  companyName: string;
  stages: StepperStage[];
  currentStageId: string;
  controls: Record<string, StageControls>;
}

// A status-colored dot is a rough visual hint only - the accessible name
// below (aria-label) is the one thing that actually states the stage's
// status, and is what the end-to-end tests and a screen reader read.
const DOT_CLASS_BY_STATUS: Record<StageStatus, string> = {
  upcoming: "border border-border bg-background",
  scheduled: "border border-primary bg-background",
  done: "border border-foreground bg-foreground",
  skipped: "border border-muted-foreground bg-muted-foreground",
};

export function StageStepper({ opportunity, companyName, stages, currentStageId, controls }: StageStepperProps) {
  const [openStageId, setOpenStageId] = React.useState<string | null>(null);
  const [editStagesOpen, setEditStagesOpen] = React.useState(false);
  const isClosed = opportunity.status === "closed";
  const openStage = stages.find((stage) => stage.id === openStageId) ?? null;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
        <nav aria-label="Stages" className="w-full min-w-0 sm:flex-1">
          <ol className="flex flex-wrap items-center gap-x-2 gap-y-3">
            {stages.map((stage) => {
              const isCurrent = stage.id === currentStageId;
              const statusWord = isCurrent ? "current" : STAGE_STATUS_WORDS[stage.status];
              return (
                <li key={stage.id} className="flex flex-col items-start gap-1">
                  <button
                    type="button"
                    aria-current={isCurrent ? "step" : undefined}
                    aria-label={`${stage.label}, ${statusWord}`}
                    onClick={() => setOpenStageId(stage.id)}
                    className={cn(
                      "flex items-center gap-1.5 rounded-full border border-border bg-card px-2.5 py-1 text-sm text-foreground",
                      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                      // Current is marked by weight and a ring, not only the
                      // dot's color: bg-primary and bg-foreground (the
                      // current and done dot colors) render as
                      // near-identical grays in this design system's tokens,
                      // in both light and dark, so color alone left current
                      // and done indistinguishable.
                      isCurrent && "border-primary font-semibold ring-2 ring-primary",
                    )}
                  >
                    <span
                      aria-hidden
                      className={cn("size-2.5 shrink-0 rounded-full", isCurrent ? "bg-primary" : DOT_CLASS_BY_STATUS[stage.status])}
                    />
                    <span className="truncate">{stage.label}</span>
                    {/* The status word: previously only in aria-label, so a
                        sighted user had no textual way to tell current, done,
                        scheduled, skipped and upcoming apart (WCAG 1.4.1) -
                        stated here as plain visible text too. aria-label
                        above still fixes the accessible name character for
                        character, so this addition does not change it. */}
                    <span className="text-xs text-muted-foreground">{statusWord}</span>
                  </button>
                  {/* The date lives outside the button as plain adjacent
                      text, not inside the accessible name: only a scheduled
                      step's scheduledAt or a done step's completedAt has one
                      worth showing. */}
                  {stage.status === "scheduled" && stage.scheduledAt ? (
                    <span className="pl-2.5 text-xs text-muted-foreground">
                      <LocalTime value={stage.scheduledAt} mode="datetime" />
                    </span>
                  ) : null}
                  {stage.status === "done" && stage.completedAt ? (
                    <span className="pl-2.5 text-xs text-muted-foreground">
                      <LocalTime value={stage.completedAt} mode="date" />
                    </span>
                  ) : null}
                </li>
              );
            })}
          </ol>
        </nav>
        <Button variant="outline" size="sm" disabled={isClosed} onClick={() => setEditStagesOpen(true)}>
          Edit stages
        </Button>
      </div>

      <StageDetailSheet
        open={openStage !== null}
        onOpenChange={(next) => {
          if (!next) setOpenStageId(null);
        }}
        opportunity={opportunity}
        companyName={companyName}
        stage={
          openStage ?? {
            id: "",
            label: "",
            kind: stages[0]?.kind ?? "saved",
            scheduledAt: null,
            format: null,
            outcomeMd: null,
          }
        }
        isCurrent={openStage !== null && openStage.id === currentStageId}
      />
      <EditStagesDialog
        open={editStagesOpen}
        onOpenChange={setEditStagesOpen}
        opportunity={opportunity}
        stages={stages}
        controls={controls}
      />
    </div>
  );
}
