"use client";

import * as React from "react";
import { toast } from "sonner";

import { saveStageDetailAction } from "@/app/(app)/jobs/[slug]/actions";
import { moveAction } from "@/app/(app)/board/actions";
import { useAnnounce } from "@/components/live-announcer";
import { FieldRow } from "@/components/super-ai/field-row";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { LocalDateTimeInput } from "@/components/local-datetime-input";
import { toLocalInputValue } from "@/lib/time/local";
import { columnTitle } from "@/lib/pipeline/labels";
import { STAGE_FORMATS, type StageFormat } from "@/lib/pipeline/values";
import { STAGE_FORMAT_LABELS } from "@/lib/pipeline/labels";
import { messageFor } from "@/lib/pipeline/messages";
import type { FormState } from "@/lib/forms/state";
import type { StageKind } from "@/lib/pipeline/kinds";
import type { OpportunityStatus } from "@/lib/pipeline/values";

interface StageDetailStage {
  id: string;
  label: string;
  kind: StageKind;
  scheduledAt: Date | null;
  format: StageFormat | null;
  outcomeMd: string | null;
}

interface StageDetailSheetProps {
  open: boolean;
  onOpenChange(open: boolean): void;
  opportunity: { id: string; roleTitle: string; status: OpportunityStatus };
  companyName: string;
  stage: StageDetailStage;
  isCurrent: boolean;
}

export function StageDetailSheet({
  open,
  onOpenChange,
  opportunity,
  companyName,
  stage,
  isCurrent,
}: StageDetailSheetProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right">
        {/* Separate component, same reasoning as AddJobForm/EditDetailsForm:
            the Popup unmounts its children while closed, and a step button
            never opens a second stage without first closing this one (it is
            a modal sheet, so nothing behind it is reachable while it is
            open) - so every open starts this body fresh for whichever
            `stage` is current at that moment. */}
        <StageDetailSheetBody
          onOpenChange={onOpenChange}
          opportunity={opportunity}
          companyName={companyName}
          stage={stage}
          isCurrent={isCurrent}
        />
      </SheetContent>
    </Sheet>
  );
}

function StageDetailSheetBody({
  onOpenChange,
  opportunity,
  companyName,
  stage,
  isCurrent,
}: Omit<StageDetailSheetProps, "open">) {
  const [state, formAction, pending] = React.useActionState<FormState, FormData>(
    saveStageDetailAction.bind(null, opportunity.id, stage.id),
    undefined,
  );
  const announce = useAnnounce();
  const submitRef = React.useRef<HTMLButtonElement>(null);
  // Controlled, not defaultValue: a successful Save does not close this
  // sheet (per the frame), so the same mounted Select goes on to receive a
  // freshly-revalidated `stage` prop whose `format` now matches whatever
  // was just picked. Base UI warns ("A component is changing the default
  // value state of an uncontrolled Select after being initialized") the
  // moment an uncontrolled Select's `defaultValue` differs across renders
  // of the same instance - confirmed empirically while running this
  // task's own manual Playwright pass (see the report). The initializer
  // only needs to run once per mount: a different `stage` only ever
  // arrives via a fresh mount (this sheet is modal, so nothing behind it -
  // including another step's button - is reachable while it is open), and
  // after a save the user's own last selection already matches the new
  // prop, so no separate effect is needed to keep the two in sync.
  const [formatValue, setFormatValue] = React.useState<StageFormat | "">(stage.format ?? "");

  React.useEffect(() => {
    // Unlike AddJobForm/EditDetailsForm, a save here never unmounts this
    // form (the sheet stays open on success, per the frame): the same
    // Chromium bug - disabling the just-clicked submit button while
    // `pending` moves focus to <body> - fires on every resolved state, not
    // only a failed one, so this refocuses on both outcomes.
    if (state !== undefined) {
      submitRef.current?.focus();
    }
  }, [state]);

  function handleMoveHere() {
    React.startTransition(async () => {
      const result = await moveAction(opportunity.id, { stageId: stage.id });
      if (!result.ok) {
        toast.error(`Could not move ${opportunity.roleTitle} at ${companyName}. ${messageFor(result.code)}`);
      } else {
        announce(`Moved ${opportunity.roleTitle} at ${companyName} to ${columnTitle(result.data.to.kind)}.`);
        onOpenChange(false);
      }
    });
  }

  const fieldErrors = state?.ok === false ? state.fieldErrors : undefined;

  return (
    <>
      <SheetHeader>
        <SheetTitle>{stage.label}</SheetTitle>
      </SheetHeader>

      <div className="flex flex-col gap-4 px-4 pb-4">
        {!isCurrent && opportunity.status === "active" ? (
          <Button variant="outline" onClick={handleMoveHere}>
            Move here
          </Button>
        ) : null}

        <form action={formAction} className="flex flex-col gap-3">
          {state?.ok === false ? (
            <p role="alert" className="text-sm text-destructive">
              {state.message}
            </p>
          ) : null}

          <FieldRow label="Date and time" hint={fieldErrors?.scheduledAt}>
            {(id, describedBy) => (
              <LocalDateTimeInput
                id={id}
                name="scheduledAt"
                defaultValue={stage.scheduledAt ? toLocalInputValue(stage.scheduledAt.toISOString()) : null}
                aria-describedby={describedBy}
              />
            )}
          </FieldRow>

          <FieldRow label="Format" hint={fieldErrors?.format}>
            {(id) => (
              <Select
                id={id}
                name="format"
                value={formatValue}
                onValueChange={(value) => setFormatValue(value as StageFormat | "")}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">No format set</SelectItem>
                  {STAGE_FORMATS.map((format) => (
                    <SelectItem key={format} value={format}>
                      {STAGE_FORMAT_LABELS[format]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </FieldRow>

          <FieldRow label="Outcome notes" hint={fieldErrors?.outcomeMd}>
            {(id, describedBy) => (
              <Textarea
                id={id}
                name="outcomeMd"
                defaultValue={stage.outcomeMd ?? ""}
                aria-describedby={describedBy}
                aria-invalid={Boolean(fieldErrors?.outcomeMd)}
              />
            )}
          </FieldRow>

          <Button ref={submitRef} type="submit" disabled={pending} className="self-end">
            Save
          </Button>
        </form>
      </div>
    </>
  );
}
