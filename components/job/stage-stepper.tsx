"use client";

import * as React from "react";

import { Button } from "@/components/ui/button";
import { StageDetailSheet } from "@/components/job/stage-detail-sheet";
import { EditStagesDialog } from "@/components/job/edit-stages-dialog";
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
      <div className="flex items-center justify-between gap-3">
        <nav aria-label="Stages" className="min-w-0 flex-1">
          <ol className="flex flex-wrap items-center gap-2">
            {stages.map((stage) => {
              const isCurrent = stage.id === currentStageId;
              const statusWord = isCurrent ? "current" : STAGE_STATUS_WORDS[stage.status];
              return (
                <li key={stage.id}>
                  <button
                    type="button"
                    aria-current={isCurrent ? "step" : undefined}
                    aria-label={`${stage.label}, ${statusWord}`}
                    disabled={isClosed}
                    onClick={() => setOpenStageId(stage.id)}
                    className="flex items-center gap-1.5 rounded-full border border-border bg-card px-2.5 py-1 text-sm text-foreground disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <span
                      aria-hidden
                      className={cn("size-2.5 shrink-0 rounded-full", isCurrent ? "bg-primary" : DOT_CLASS_BY_STATUS[stage.status])}
                    />
                    <span className="truncate">{stage.label}</span>
                  </button>
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
