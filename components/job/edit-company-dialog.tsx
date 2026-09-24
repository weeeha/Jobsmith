"use client";

import * as React from "react";

import { updateCompanyDetailsAction } from "@/app/(app)/jobs/[slug]/actions";
import { FieldRow } from "@/components/super-ai/field-row";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { submitViaTransition } from "@/lib/forms/submit";
import type { FormState } from "@/lib/forms/state";
import type { CompanyRow } from "@/lib/db/scoped";

export function EditCompanyDialogTrigger({
  company,
  opportunityId,
}: {
  company: CompanyRow;
  opportunityId: string;
}) {
  const [open, setOpen] = React.useState(false);

  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)}>
        Edit company
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          {/* Separate component inside DialogContent, same reasoning as
              edit-details-dialog.tsx's EditDetailsForm: the Popup unmounts
              its children while closed, so every reopen starts a fresh
              useActionState instead of a previous attempt's stale error. */}
          <EditCompanyForm onOpenChange={setOpen} company={company} opportunityId={opportunityId} />
        </DialogContent>
      </Dialog>
    </>
  );
}

function EditCompanyForm({
  onOpenChange,
  company,
  opportunityId,
}: {
  onOpenChange: (open: boolean) => void;
  company: CompanyRow;
  opportunityId: string;
}) {
  const [state, formAction, pending] = React.useActionState<FormState, FormData>(
    updateCompanyDetailsAction.bind(null, company.id, opportunityId),
    undefined,
  );
  const submitRef = React.useRef<HTMLButtonElement>(null);
  // Snapshot, not a live read of `company`: same reasoning as
  // edit-details-dialog.tsx's `initialOpportunity` - Base UI keeps this form
  // mounted for its own closing-transition animation after a successful save
  // flips `onOpenChange(false)`, and that same save is what revalidates
  // `company` with the new values, so a live read would hand every
  // uncontrolled field here a changed `defaultValue` while still mounted,
  // which is what triggers Base UI's "changing the default value state of an
  // uncontrolled FieldControl after being initialized" warning.
  const [initialCompany] = React.useState(company);

  React.useEffect(() => {
    if (state?.ok) {
      onOpenChange(false);
    } else if (state?.ok === false) {
      // Same Chromium disabled-focus-loss fix as every other form here: the
      // Save button is disabled while pending, which drops focus to <body>,
      // and the dialog's own focus trap only recaptures a Tab/Shift+Tab
      // escape, not this.
      submitRef.current?.focus();
    }
  }, [state, onOpenChange]);

  const fieldErrors = state?.ok === false ? state.fieldErrors : undefined;

  return (
    <form onSubmit={(event) => submitViaTransition(event, formAction)} className="flex flex-col gap-4">
      <DialogHeader>
        <DialogTitle>Edit company</DialogTitle>
      </DialogHeader>

      {state?.ok === false ? (
        <p role="alert" className="text-sm text-destructive">
          {state.message}
        </p>
      ) : null}

      <div className="flex max-h-96 flex-col gap-3 overflow-y-auto">
        <FieldRow label="Website" hint={fieldErrors?.domain}>
          {(id, describedBy) => (
            <Input
              id={id}
              name="domain"
              defaultValue={initialCompany.domain ?? ""}
              aria-describedby={describedBy}
              aria-invalid={Boolean(fieldErrors?.domain)}
            />
          )}
        </FieldRow>

        <FieldRow label="Careers page" hint={fieldErrors?.careersUrl}>
          {(id, describedBy) => (
            <Input
              id={id}
              name="careersUrl"
              defaultValue={initialCompany.careersUrl ?? ""}
              aria-describedby={describedBy}
              aria-invalid={Boolean(fieldErrors?.careersUrl)}
            />
          )}
        </FieldRow>

        <FieldRow label="Size" hint={fieldErrors?.size}>
          {(id, describedBy) => (
            <Input
              id={id}
              name="size"
              defaultValue={initialCompany.size ?? ""}
              aria-describedby={describedBy}
              aria-invalid={Boolean(fieldErrors?.size)}
            />
          )}
        </FieldRow>

        <FieldRow label="Industry" hint={fieldErrors?.industry}>
          {(id, describedBy) => (
            <Input
              id={id}
              name="industry"
              defaultValue={initialCompany.industry ?? ""}
              aria-describedby={describedBy}
              aria-invalid={Boolean(fieldErrors?.industry)}
            />
          )}
        </FieldRow>

        <FieldRow label="Headquarters" hint={fieldErrors?.hq}>
          {(id, describedBy) => (
            <Input
              id={id}
              name="hq"
              defaultValue={initialCompany.hq ?? ""}
              aria-describedby={describedBy}
              aria-invalid={Boolean(fieldErrors?.hq)}
            />
          )}
        </FieldRow>

        <FieldRow label="Notes" hint={fieldErrors?.notesMd}>
          {(id, describedBy) => (
            <Textarea
              id={id}
              name="notesMd"
              defaultValue={initialCompany.notesMd ?? ""}
              aria-describedby={describedBy}
              aria-invalid={Boolean(fieldErrors?.notesMd)}
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
