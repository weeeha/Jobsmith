"use client";

import * as React from "react";
import Link from "next/link";

import { createOpportunityAction } from "@/app/(app)/board/actions";
import { useAnnounce } from "@/components/live-announcer";
import { FieldRow } from "@/components/super-ai/field-row";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { STAGE_KINDS } from "@/lib/pipeline/kinds";
import type { FormState } from "@/lib/forms/state";

interface AddJobDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  companyNames: string[];
}

export function AddJobDialog({ open, onOpenChange, companyNames }: AddJobDialogProps) {
  const [state, formAction, pending] = React.useActionState<FormState, FormData>(createOpportunityAction, undefined);
  const announce = useAnnounce();
  const lastSubmitted = React.useRef({ companyName: "", roleTitle: "" });
  const companyListId = React.useId();
  const submitRef = React.useRef<HTMLButtonElement>(null);

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    const data = new FormData(event.currentTarget);
    lastSubmitted.current = {
      companyName: String(data.get("companyName") ?? ""),
      roleTitle: String(data.get("roleTitle") ?? ""),
    };
  }

  React.useEffect(() => {
    if (state?.ok) {
      onOpenChange(false);
      announce(`Added ${lastSubmitted.current.roleTitle} at ${lastSubmitted.current.companyName}.`);
    } else if (state?.ok === false) {
      // The submit button is genuinely `disabled` (not merely
      // `aria-disabled`) while `pending` is true, since Base UI's Button
      // does not opt into `focusableWhenDisabled`. Disabling the button
      // the user just clicked moves focus to <body> in Chromium, and the
      // dialog's own focus trap only recaptures focus that tries to leave
      // via Tab/Shift+Tab, not a loss caused by the focused element itself
      // going away - so once the pending state clears and these field
      // errors render, nothing brings focus back on its own (confirmed
      // empirically with a scratch Playwright script). Putting it back on
      // the control the user just activated is the minimal fix that keeps
      // focus inside the dialog, matching both this task's own manual
      // check ("focus stays in the dialog") and the requirement that the
      // dialog traps focus.
      submitRef.current?.focus();
    }
  }, [state, onOpenChange, announce]);

  const fieldErrors = state?.ok === false ? state.fieldErrors : undefined;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <form action={formAction} onSubmit={handleSubmit} className="flex flex-col gap-4">
          <DialogHeader>
            <DialogTitle>Add a job</DialogTitle>
          </DialogHeader>

          {state?.ok === false ? (
            <p role="alert" className="text-sm text-destructive">
              {state.message}
              {state.href ? (
                <>
                  {" "}
                  <Link href={state.href} className="underline underline-offset-4">
                    Open it
                  </Link>
                </>
              ) : null}
            </p>
          ) : null}

          <div className="flex max-h-96 flex-col gap-3 overflow-y-auto">
            <FieldRow label="Company" hint={fieldErrors?.companyName}>
              {(id, describedBy) => (
                <>
                  <Input
                    id={id}
                    name="companyName"
                    list={companyListId}
                    aria-describedby={describedBy}
                    aria-invalid={Boolean(fieldErrors?.companyName)}
                  />
                  <datalist id={companyListId}>
                    {companyNames.map((name) => (
                      <option key={name} value={name} />
                    ))}
                  </datalist>
                </>
              )}
            </FieldRow>

            <FieldRow label="Role" hint={fieldErrors?.roleTitle}>
              {(id, describedBy) => (
                <Input
                  id={id}
                  name="roleTitle"
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
                  aria-describedby={describedBy}
                  aria-invalid={Boolean(fieldErrors?.location)}
                />
              )}
            </FieldRow>

            <FieldRow label="Work mode" hint={fieldErrors?.workMode}>
              {(id, describedBy) => (
                <RadioGroup
                  id={id}
                  name="workMode"
                  aria-describedby={describedBy}
                  aria-invalid={Boolean(fieldErrors?.workMode)}
                >
                  <div className="flex items-center gap-2">
                    <RadioGroupItem value="remote" id="add-job-work-mode-remote" />
                    <Label htmlFor="add-job-work-mode-remote">Remote</Label>
                  </div>
                  <div className="flex items-center gap-2">
                    <RadioGroupItem value="hybrid" id="add-job-work-mode-hybrid" />
                    <Label htmlFor="add-job-work-mode-hybrid">Hybrid</Label>
                  </div>
                  <div className="flex items-center gap-2">
                    <RadioGroupItem value="onsite" id="add-job-work-mode-onsite" />
                    <Label htmlFor="add-job-work-mode-onsite">On site</Label>
                  </div>
                </RadioGroup>
              )}
            </FieldRow>

            <FieldRow label="Link to the posting" hint={fieldErrors?.sourceUrl}>
              {(id, describedBy) => (
                <Input
                  id={id}
                  type="url"
                  name="sourceUrl"
                  aria-describedby={describedBy}
                  aria-invalid={Boolean(fieldErrors?.sourceUrl)}
                />
              )}
            </FieldRow>

            <FieldRow label="Posting text" hint={fieldErrors?.postingText}>
              {(id, describedBy) => (
                <Textarea
                  id={id}
                  name="postingText"
                  aria-describedby={describedBy}
                  aria-invalid={Boolean(fieldErrors?.postingText)}
                />
              )}
            </FieldRow>

            <FieldRow label="Pay from" hint={fieldErrors?.compMin}>
              {(id, describedBy) => (
                <Input
                  id={id}
                  type="number"
                  name="compMin"
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
                  aria-describedby={describedBy}
                  aria-invalid={Boolean(fieldErrors?.myAsk)}
                />
              )}
            </FieldRow>

            <FieldRow label="Where is it now">
              {(id) => (
                <Select id={id} name="whereIsItNow" defaultValue="saved">
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {STAGE_KINDS.map((stage) => (
                      <SelectItem key={stage.kind} value={stage.kind}>
                        {stage.columnTitle}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </FieldRow>
          </div>

          <DialogFooter>
            <Button ref={submitRef} type="submit" disabled={pending}>
              Add job
            </Button>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
