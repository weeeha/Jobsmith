"use client";

import * as React from "react";

import { setNextActionAction } from "@/app/(app)/jobs/[slug]/actions";
import { useAnnounce } from "@/components/live-announcer";
import { LocalDateTimeInput } from "@/components/local-datetime-input";
import { FieldRow } from "@/components/super-ai/field-row";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { submitViaTransition } from "@/lib/forms/submit";
import type { FormState } from "@/lib/forms/state";

export type NextActionSubject = {
  id: string;
  roleTitle: string;
  companyName: string;
  nextAction: string | null;
  nextActionAt: Date | null;
};

/**
 * The dialog behind the next action offer. Open while `subject` is not null;
 * `onClose(true)` after a save, `onClose(false)` for Cancel, Escape or a
 * click outside. The host decides where focus goes next, because only it
 * knows which element replaced the one that opened this.
 */
export function SetNextActionDialog({
  subject,
  onClose,
}: {
  subject: NextActionSubject | null;
  onClose: (saved: boolean) => void;
}) {
  // Created here, not in the form: Base UI reads `initialFocus` from the
  // popup, which is this component's child and so cannot own the ref.
  const textRef = React.useRef<HTMLInputElement>(null);
  return (
    <Dialog
      open={subject !== null}
      onOpenChange={(open) => {
        if (!open) onClose(false);
      }}
    >
      <DialogContent initialFocus={textRef}>
        {/* Keyed by job and mounted only while open, so every open starts a
            fresh action state instead of the last attempt's error. */}
        {subject ? <SetNextActionForm key={subject.id} subject={subject} textRef={textRef} onClose={onClose} /> : null}
      </DialogContent>
    </Dialog>
  );
}

function SetNextActionForm({
  subject,
  textRef,
  onClose,
}: {
  subject: NextActionSubject;
  textRef: React.RefObject<HTMLInputElement | null>;
  onClose: (saved: boolean) => void;
}) {
  const [state, formAction, pending] = React.useActionState<FormState, FormData>(
    setNextActionAction.bind(null, subject.id),
    undefined,
  );
  const announce = useAnnounce();
  const submitRef = React.useRef<HTMLButtonElement>(null);
  // Snapshot, not a live read: the job page passes live props, and a save
  // revalidates them while this form is still mounted, which would hand the
  // uncontrolled fields a changed defaultValue.
  const [initial] = React.useState(subject);
  // A state is acted on once. The host re-renders with a new onClose each
  // time, and the same successful state must not announce and close twice.
  const handled = React.useRef<FormState>(undefined);

  React.useEffect(() => {
    if (state === handled.current) return;
    handled.current = state;
    if (state?.ok) {
      announce(`Next action saved for ${initial.roleTitle} at ${initial.companyName}.`);
      onClose(true);
    } else if (state?.ok === false) {
      // Chromium drops focus to <body> when the clicked Save button is
      // disabled while pending; a rejection leaves this form mounted.
      submitRef.current?.focus();
    }
  }, [state, announce, onClose, initial.roleTitle, initial.companyName]);

  const fieldErrors = state?.ok === false ? state.fieldErrors : undefined;

  return (
    <form onSubmit={(event) => submitViaTransition(event, formAction)} className="flex min-w-0 flex-col gap-4">
      <DialogHeader>
        <DialogTitle>Set the next action</DialogTitle>
        <DialogDescription className="break-words">
          {initial.roleTitle} at {initial.companyName}
        </DialogDescription>
      </DialogHeader>

      {state?.ok === false ? (
        <p role="alert" className="text-sm text-destructive">
          {state.message}
        </p>
      ) : null}

      <FieldRow label="What is next" hint={fieldErrors?.text}>
        {(id, describedBy) => (
          <Input
            ref={textRef}
            id={id}
            name="text"
            defaultValue={initial.nextAction ?? ""}
            aria-describedby={describedBy}
            aria-invalid={Boolean(fieldErrors?.text)}
          />
        )}
      </FieldRow>

      <FieldRow label="When" hint={fieldErrors?.at}>
        {(id, describedBy) => (
          <LocalDateTimeInput
            id={id}
            name="at"
            // The ISO instant itself: LocalDateTimeInput converts it to the
            // profile zone for the visible field.
            defaultValue={initial.nextActionAt ? initial.nextActionAt.toISOString() : null}
            aria-describedby={describedBy}
          />
        )}
      </FieldRow>

      <DialogFooter>
        <Button type="button" variant="outline" onClick={() => onClose(false)}>
          Cancel
        </Button>
        <Button ref={submitRef} type="submit" disabled={pending}>
          Save
        </Button>
      </DialogFooter>
    </form>
  );
}
