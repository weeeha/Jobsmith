"use client";

import * as React from "react";

import { updateOpportunityDetailsAction } from "@/app/(app)/jobs/[slug]/actions";
import { FieldRow } from "@/components/super-ai/field-row";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { submitViaTransition } from "@/lib/forms/submit";
import type { FormState } from "@/lib/forms/state";
import type { WorkMode } from "@/lib/pipeline/values";

// Postgres's `integer` columns (comp_min, comp_max) top out here - matches
// the bound updateOpportunityDetailsSchema enforces server-side; the input's
// own `max` gives the browser's native stepper/validation the same ceiling.
const MAX_COMP = 2_147_483_647;

interface EditDetailsDialogOpportunity {
  id: string;
  roleTitle: string;
  location: string | null;
  workMode: WorkMode | null;
  sourceUrl: string | null;
  compMin: number | null;
  compMax: number | null;
  compCurrency: string | null;
  compNote: string | null;
  myAsk: string | null;
}

interface EditDetailsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  opportunity: EditDetailsDialogOpportunity;
}

export function EditDetailsDialog({ open, onOpenChange, opportunity }: EditDetailsDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        {/* Separate component inside DialogContent, same reasoning as
            AddJobDialog/AddJobForm (Task 8): useActionState lives in
            content that unmounts on close, so every reopen starts with a
            fresh form instead of a previous attempt's stale error. */}
        <EditDetailsForm onOpenChange={onOpenChange} opportunity={opportunity} />
      </DialogContent>
    </Dialog>
  );
}

function EditDetailsForm({
  onOpenChange,
  opportunity,
}: {
  onOpenChange: (open: boolean) => void;
  opportunity: EditDetailsDialogOpportunity;
}) {
  const [state, formAction, pending] = React.useActionState<FormState, FormData>(
    updateOpportunityDetailsAction.bind(null, opportunity.id),
    undefined,
  );
  const submitRef = React.useRef<HTMLButtonElement>(null);
  // Snapshot, not a live read of `opportunity`: Base UI's Dialog keeps this
  // form mounted for its own brief closing-transition animation after a
  // successful save flips `onOpenChange(false)` (matching sheet.tsx's
  // duration-200/dialog.tsx's duration-100), and the very save that closes
  // this dialog is also what revalidates `opportunity` with the new
  // values - so a live read would hand every uncontrolled field here a
  // changed `defaultValue` while still mounted, which is exactly what
  // triggered Base UI's "changing the default value state of an
  // uncontrolled FieldControl after being initialized" warning, confirmed
  // empirically while running this task's own manual Playwright pass (see
  // the report). A one-time snapshot is correct, not just convenient: this
  // form is about to disappear, so it only ever needs to show what was
  // true when it opened.
  const [initialOpportunity] = React.useState(opportunity);

  React.useEffect(() => {
    if (state?.ok) {
      onOpenChange(false);
    } else if (state?.ok === false) {
      // Same Chromium focus-loss fix as AddJobForm (Task 8 review finding
      // 1): disabling the just-clicked submit button while `pending`
      // clears drops focus to <body>, and the dialog's focus trap only
      // recaptures a Tab/Shift+Tab escape, not this. Putting focus back on
      // the control the user just activated keeps it inside the dialog.
      submitRef.current?.focus();
    }
  }, [state, onOpenChange]);

  const fieldErrors = state?.ok === false ? state.fieldErrors : undefined;

  return (
    // Finding 3 (Task 11 fix round 1): converted from <form action={formAction}>
    // to submitViaTransition (lib/forms/submit.ts) - confirmed empirically
    // (Task 11's report) that React 19's requestFormReset wipes every
    // uncontrolled field back to its defaultValue after ANY <form action>
    // dispatch settles, including a failed one (Role reverted to its
    // pre-edit value on a rejected save).
    <form onSubmit={(event) => submitViaTransition(event, formAction)} className="flex flex-col gap-4">
      <DialogHeader>
        <DialogTitle>Edit details</DialogTitle>
      </DialogHeader>

      {state?.ok === false ? (
        <p role="alert" className="text-sm text-destructive">
          {state.message}
        </p>
      ) : null}

      <div className="flex max-h-96 flex-col gap-3 overflow-y-auto">
        <FieldRow label="Role" hint={fieldErrors?.roleTitle}>
          {(id, describedBy) => (
            <Input
              id={id}
              name="roleTitle"
              defaultValue={initialOpportunity.roleTitle}
              aria-describedby={describedBy}
              aria-invalid={Boolean(fieldErrors?.roleTitle)}
            />
          )}
        </FieldRow>

        <FieldRow label="Location" hint={fieldErrors?.location}>
          {(id, describedBy) => (
            <Input
              id={id}
              name="location"
              defaultValue={initialOpportunity.location ?? ""}
              aria-describedby={describedBy}
              aria-invalid={Boolean(fieldErrors?.location)}
            />
          )}
        </FieldRow>

        <FieldRow label="Work mode" hint={fieldErrors?.workMode}>
          {(id, describedBy) => {
            const legendId = `${id}-legend`;
            return (
              // See add-job-dialog.tsx's identical "Work mode" block: Base
              // UI's RadioGroup only takes its accessible name from its own
              // Field.Label/Fieldset.Legend context, never plain HTML
              // fieldset/legend ancestry, so the name is wired explicitly.
              <fieldset className="contents">
                <legend id={legendId} className="sr-only">
                  Work mode
                </legend>
                <RadioGroup
                  id={id}
                  name="workMode"
                  defaultValue={initialOpportunity.workMode ?? undefined}
                  aria-labelledby={legendId}
                  aria-describedby={describedBy}
                  aria-invalid={Boolean(fieldErrors?.workMode)}
                >
                  <div className="flex items-center gap-2">
                    <RadioGroupItem value="remote" id={`${id}-remote`} />
                    <Label htmlFor={`${id}-remote`}>Remote</Label>
                  </div>
                  <div className="flex items-center gap-2">
                    <RadioGroupItem value="hybrid" id={`${id}-hybrid`} />
                    <Label htmlFor={`${id}-hybrid`}>Hybrid</Label>
                  </div>
                  <div className="flex items-center gap-2">
                    <RadioGroupItem value="onsite" id={`${id}-onsite`} />
                    <Label htmlFor={`${id}-onsite`}>On site</Label>
                  </div>
                </RadioGroup>
              </fieldset>
            );
          }}
        </FieldRow>

        <FieldRow label="Link to the posting" hint={fieldErrors?.sourceUrl}>
          {(id, describedBy) => (
            <Input
              id={id}
              type="url"
              name="sourceUrl"
              defaultValue={initialOpportunity.sourceUrl ?? ""}
              aria-describedby={describedBy}
              aria-invalid={Boolean(fieldErrors?.sourceUrl)}
            />
          )}
        </FieldRow>

        <FieldRow label="Pay from" hint={fieldErrors?.compMin}>
          {(id, describedBy) => (
            <Input
              id={id}
              type="number"
              name="compMin"
              max={MAX_COMP}
              defaultValue={initialOpportunity.compMin ?? undefined}
              aria-describedby={describedBy}
              aria-invalid={Boolean(fieldErrors?.compMin)}
            />
          )}
        </FieldRow>

        <FieldRow label="Pay to" hint={fieldErrors?.compMax}>
          {(id, describedBy) => (
            <Input
              id={id}
              type="number"
              name="compMax"
              max={MAX_COMP}
              defaultValue={initialOpportunity.compMax ?? undefined}
              aria-describedby={describedBy}
              aria-invalid={Boolean(fieldErrors?.compMax)}
            />
          )}
        </FieldRow>

        <FieldRow label="Currency" hint={fieldErrors?.compCurrency}>
          {(id, describedBy) => (
            <Input
              id={id}
              name="compCurrency"
              defaultValue={initialOpportunity.compCurrency ?? ""}
              aria-describedby={describedBy}
              aria-invalid={Boolean(fieldErrors?.compCurrency)}
            />
          )}
        </FieldRow>

        <FieldRow label="Pay note" hint={fieldErrors?.compNote}>
          {(id, describedBy) => (
            <Textarea
              id={id}
              name="compNote"
              defaultValue={initialOpportunity.compNote ?? ""}
              aria-describedby={describedBy}
              aria-invalid={Boolean(fieldErrors?.compNote)}
            />
          )}
        </FieldRow>

        <FieldRow label="My ask" hint={fieldErrors?.myAsk}>
          {(id, describedBy) => (
            <Textarea
              id={id}
              name="myAsk"
              defaultValue={initialOpportunity.myAsk ?? ""}
              aria-describedby={describedBy}
              aria-invalid={Boolean(fieldErrors?.myAsk)}
            />
          )}
        </FieldRow>
      </div>

      <DialogFooter>
        <Button ref={submitRef} type="submit" disabled={pending}>
          Save
        </Button>
      </DialogFooter>
    </form>
  );
}
