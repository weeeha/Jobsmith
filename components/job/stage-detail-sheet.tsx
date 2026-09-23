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
import { actionFailureMessage } from "@/lib/board/messages";
import { submitViaTransition } from "@/lib/forms/submit";
import type { FormState } from "@/lib/forms/state";
import type { StageKind } from "@/lib/pipeline/kinds";
import type { OpportunityStatus } from "@/lib/pipeline/values";

// Finding 3 (Task 10 fix round 1): Base UI's <Select.Value> resolves its
// label purely from the Root's own `items` prop (node_modules/@base-ui/
// react/select/value/SelectValue.js: resolveSelectedLabel(value, items)),
// never from having once rendered a matching <Select.Item> - without it, a
// closed Select shows the raw stored value ("video") until the popup has
// been opened at least once. Includes the empty "no format" option, whose
// own visible label ("No format set") lives here too so there is exactly
// one place that names it.
const NO_FORMAT_LABEL = "No format set";
const FORMAT_SELECT_ITEMS: Record<string, string> = {
  "": NO_FORMAT_LABEL,
  ...Object.fromEntries(STAGE_FORMATS.map((format) => [format, STAGE_FORMAT_LABELS[format]])),
};

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
  // Controlled, not defaultValue: a rejected Save leaves this same instance
  // mounted (only a successful Save closes it), so an uncontrolled Select's
  // own `defaultValue` would go stale the moment the user picks a different
  // option and that save is then rejected. Base UI warns ("A component is
  // changing the default value state of an uncontrolled Select after being
  // initialized") the moment an uncontrolled Select's `defaultValue` differs
  // across renders of the same instance - confirmed empirically while
  // running this task's own manual Playwright pass (see the report). The
  // initializer only needs to run once per mount: a success closes (and any
  // later open remounts) this whole component, so the only renders it
  // survives are rejected ones, where the user's own last pick already
  // belongs here.
  const [formatValue, setFormatValue] = React.useState<StageFormat | "">(stage.format ?? "");

  React.useEffect(() => {
    if (state?.ok) {
      // Closing is this sheet's only success feedback, matching every other
      // form in this app. Base UI's Popup already returns focus to the step
      // button that opened it once this unmounts (the same default
      // move-sheet.tsx documents relying on for its own rows), so nothing
      // here needs to manage focus itself.
      onOpenChange(false);
    } else if (state?.ok === false) {
      // Chromium moves focus to <body> when the just-clicked Save button is
      // disabled while `pending` is true (Base UI's Button does not opt
      // into focusableWhenDisabled). A rejection leaves this sheet open and
      // this instance mounted, so Save is reachable to refocus.
      submitRef.current?.focus();
    }
  }, [state, onOpenChange]);

  function handleMoveHere() {
    React.startTransition(async () => {
      const subject = { roleTitle: opportunity.roleTitle, companyName };
      try {
        const result = await moveAction(opportunity.id, { stageId: stage.id });
        if (!result.ok) {
          toast.error(actionFailureMessage("move", subject, result.code));
          return;
        }
        announce(`Moved ${opportunity.roleTitle} at ${companyName} to ${columnTitle(result.data.to.kind)}.`);
        onOpenChange(false);
      } catch (error) {
        // moveAction can reject before ever returning a Result - see
        // board.tsx's runMove for the same case.
        console.error("move failed", error);
        toast.error(actionFailureMessage("move", subject, "unexpected"));
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

        {/* Finding 3 (Task 11 fix round 1): converted from <form
            action={formAction}> to submitViaTransition (lib/forms/submit.ts).
            "Outcome notes" and "Date and time" below are uncontrolled
            (defaultValue) and, unlike the Format Select above, never given
            the controlled-state fix, so React 19's requestFormReset was
            wiping them back to their pre-save defaultValue on a REJECTED
            save - the one case that leaves this same instance mounted with
            its error showing (a successful save closes the sheet instead,
            per the effect above, so there is no stale-defaultValue case to
            guard there). */}
        <form onSubmit={(event) => submitViaTransition(event, formAction)} className="flex flex-col gap-3">
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
                items={FORMAT_SELECT_ITEMS}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">{NO_FORMAT_LABEL}</SelectItem>
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
