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
            <legend className="text-sm font-medium">Reason</legend>
            {/* value={reason ?? ""}, never a literal `undefined`: Base UI
                (like React) treats a RadioGroup as uncontrolled for as long
                as `value` is `undefined`, so setting a real reason after
                the initial no-selection render would flip it from
                uncontrolled to controlled mid-lifetime (a real warning,
                caught by exercising this dialog in the browser - no
                CLOSED_REASON is ever the empty string, so "" is a safe
                always-defined sentinel for "nothing chosen yet"). */}
            <RadioGroup value={reason ?? ""} onValueChange={(value) => setReason(value as ClosedReason)}>
              {CLOSED_REASONS.map((closedReason) => (
                <div key={closedReason} className="flex items-center gap-2">
                  <RadioGroupItem value={closedReason} id={`close-reason-${closedReason}`} />
                  <Label htmlFor={`close-reason-${closedReason}`}>{CLOSED_REASON_LABELS[closedReason]}</Label>
                </div>
              ))}
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
