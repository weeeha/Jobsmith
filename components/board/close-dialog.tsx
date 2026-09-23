"use client";

import * as React from "react";

import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { CLOSED_REASONS, type ClosedReason } from "@/lib/pipeline/values";
import { CLOSED_REASON_LABELS } from "@/lib/pipeline/labels";

interface CloseDialogProps {
  open: boolean;
  onOpenChange(open: boolean): void;
  job: { roleTitle: string; companyName: string } | null;
  onConfirm(reason: ClosedReason): void;
}

export function CloseDialog({ open, onOpenChange, job, onConfirm }: CloseDialogProps) {
  const [reason, setReason] = React.useState<ClosedReason | undefined>(undefined);
  // Both the legend's own id and every radio item's id below are derived
  // from this one React.useId() call, not literal strings: this dialog is
  // now mounted twice at once - once under Board, once under PhoneBoard -
  // and a display:none ancestor on whichever tree the current viewport
  // hides does not remove its DOM nodes, only hide them, so a
  // hardcoded id here would be a real duplicate id in the document the
  // moment both instances were open together, not just a theoretical one.
  // useId() is unique per mounted instance regardless of how many trees are
  // mounted at once, so appending a static suffix to it is still safe.
  const legendId = React.useId();

  // Clears any reason chosen on a previous open so it cannot linger into
  // the next one. Keyed on `open` rather than derived at render time
  // because the value must survive for the whole time the dialog is open,
  // including while the user is still choosing.
  React.useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (open) setReason(undefined);
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Close this job</DialogTitle>
          {job ? (
            <DialogDescription>
              {job.roleTitle} at {job.companyName}
            </DialogDescription>
          ) : null}
        </DialogHeader>
        {job ? (
          <fieldset className="flex flex-col gap-2">
            <legend id={legendId} className="text-sm font-medium">
              Reason
            </legend>
            {/* value={reason ?? ""}, never a literal `undefined`: Base UI
                (like React) treats a RadioGroup as uncontrolled for as long
                as `value` is `undefined`, so setting a real reason after
                the initial no-selection render would flip it from
                uncontrolled to controlled mid-lifetime (a real warning,
                caught by exercising this dialog in the browser - no
                CLOSED_REASON is ever the empty string, so "" is a safe
                always-defined sentinel for "nothing chosen yet").

                aria-labelledby={legendId}: a native <fieldset>/<legend>
                names the surrounding role="group" on its own, but Base
                UI's RadioGroup only takes its OWN aria-labelledby from its
                own Field.Label/Fieldset.Root React context (confirmed by
                reading node_modules/@base-ui/react/radio-group/
                RadioGroup.js), never from plain DOM ancestry -
                add-job-dialog.tsx's "Work mode" group hit the identical gap
                first. Without this, the aria snapshot of this dialog reads
                `group "Reason": radiogroup: radio "Rejected" ...` - the
                fieldset is named, the nested radiogroup is not - and
                getByRole("radiogroup", { name: /reason/i }) resolves to
                nothing. axe-core's aria-input-field-name rule does not
                cover the radiogroup role, so it cannot catch this on its
                own; it has to be asserted directly. */}
            <RadioGroup
              aria-labelledby={legendId}
              value={reason ?? ""}
              onValueChange={(value) => setReason(value as ClosedReason)}
            >
              {CLOSED_REASONS.map((closedReason) => {
                const itemId = `${legendId}-${closedReason}`;
                return (
                  <div key={closedReason} className="flex items-center gap-2">
                    <RadioGroupItem value={closedReason} id={itemId} />
                    <Label htmlFor={itemId}>{CLOSED_REASON_LABELS[closedReason]}</Label>
                  </div>
                );
              })}
            </RadioGroup>
          </fieldset>
        ) : null}
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button disabled={!reason} onClick={() => reason && onConfirm(reason)}>
            Close job
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
