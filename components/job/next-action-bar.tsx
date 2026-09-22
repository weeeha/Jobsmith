"use client";

import * as React from "react";
import { toast } from "sonner";

import { setNextActionAction, completeNextActionAction } from "@/app/(app)/jobs/[slug]/actions";
import { FieldRow } from "@/components/super-ai/field-row";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { LocalTime } from "@/components/local-time";
import { LocalDateTimeInput } from "@/components/local-datetime-input";
import { toLocalInputValue } from "@/lib/time/local";
import { messageFor } from "@/lib/pipeline/messages";
import { focusWasLost } from "@/lib/dom/focus";
import type { FormState } from "@/lib/forms/state";

interface NextActionBarProps {
  opportunity: { id: string; roleTitle: string; nextAction: string | null; nextActionAt: Date | null };
}

export function NextActionBar({ opportunity }: NextActionBarProps) {
  const [editing, setEditing] = React.useState(false);
  const [isDonePending, startDoneTransition] = React.useTransition();
  const addRef = React.useRef<HTMLButtonElement>(null);
  const doneRef = React.useRef<HTMLButtonElement>(null);
  const editRef = React.useRef<HTMLButtonElement>(null);
  const wasEditing = React.useRef(false);
  const previousNextAction = React.useRef(opportunity.nextAction);

  // "Edit" and "Add" both unmount themselves the instant they are clicked
  // (the branch below switches to the form), and a focused element that
  // is removed from the document loses focus to <body> regardless of
  // browser - so every time editing turns on, focus moves into the form's
  // first field instead of following the trap and landing on <body>.
  React.useEffect(() => {
    if (editing) {
      wasEditing.current = true;
      return;
    }
    if (wasEditing.current) {
      // Just closed by a successful save (the only path that flips
      // `editing` back to false) - the form (and its Save button) is
      // gone, so land on "Edit" in the filled view that replaces it.
      editRef.current?.focus();
    }
    wasEditing.current = false;
  }, [editing]);

  // "Done" makes nextAction (and its own button) disappear on success -
  // same removed-focused-element case as above, recovered onto "Add" in
  // the now-empty view.
  React.useEffect(() => {
    const justCompleted = previousNextAction.current !== null && opportunity.nextAction === null;
    previousNextAction.current = opportunity.nextAction;
    if (justCompleted && focusWasLost()) {
      addRef.current?.focus();
    }
  }, [opportunity.nextAction]);

  function handleDone() {
    startDoneTransition(async () => {
      const result = await completeNextActionAction(opportunity.id);
      if (!result.ok) {
        toast.error(messageFor(result.code));
        // Only reachable on failure: on success this element is about to
        // be removed anyway (nextAction becomes null), and the effect
        // above takes over.
        if (focusWasLost()) {
          doneRef.current?.focus();
        }
      }
    });
  }

  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-base font-semibold text-foreground">Next action</h2>

      {editing ? (
        <NextActionForm opportunity={opportunity} onSaved={() => setEditing(false)} />
      ) : opportunity.nextAction === null ? (
        <div className="flex items-center gap-2">
          <p className="text-muted-foreground">No next action.</p>
          <Button ref={addRef} variant="outline" size="sm" onClick={() => setEditing(true)}>
            Add
          </Button>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-foreground">
            {opportunity.nextAction}
            {opportunity.nextActionAt ? (
              <>
                {" "}
                <LocalTime value={opportunity.nextActionAt} mode="datetime" />
              </>
            ) : null}
          </p>
          <Button ref={doneRef} variant="outline" size="sm" disabled={isDonePending} onClick={handleDone}>
            Done
          </Button>
          <Button ref={editRef} variant="outline" size="sm" onClick={() => setEditing(true)}>
            Edit
          </Button>
        </div>
      )}
    </section>
  );
}

function NextActionForm({
  opportunity,
  onSaved,
}: {
  opportunity: { id: string; nextAction: string | null; nextActionAt: Date | null };
  onSaved: () => void;
}) {
  const [state, formAction, pending] = React.useActionState<FormState, FormData>(
    setNextActionAction.bind(null, opportunity.id),
    undefined,
  );
  const textInputRef = React.useRef<HTMLInputElement>(null);
  const submitRef = React.useRef<HTMLButtonElement>(null);
  // Snapshot, not a live read: on a successful save this form unmounts
  // (`onSaved` flips `editing` back to false), but that unmount and the
  // save's own revalidation of `opportunity.nextAction` are two separate
  // updates - the framework's page-data refresh and this form's own
  // `state` settling are not guaranteed to land in the same commit - so a
  // live read can hand the uncontrolled "What is next" Input a changed
  // `defaultValue` for one render while still mounted. Confirmed
  // empirically the same way as edit-details-dialog.tsx's identical fix
  // (see the report): Base UI's "changing the default value state of an
  // uncontrolled FieldControl after being initialized" warning, reproduced
  // on a freshly seeded job with only Add-then-Save touched.
  const [initialOpportunity] = React.useState(opportunity);

  React.useEffect(() => {
    textInputRef.current?.focus();
  }, []);

  React.useEffect(() => {
    if (state?.ok) {
      onSaved();
    } else if (state?.ok === false) {
      // Same Chromium disabled-focus-loss fix as every other form here:
      // the Save button is disabled while pending, and this form does not
      // unmount on a failure (only on success), so it stays reachable to
      // refocus.
      submitRef.current?.focus();
    }
  }, [state, onSaved]);

  const fieldErrors = state?.ok === false ? state.fieldErrors : undefined;

  return (
    <form action={formAction} className="flex flex-col gap-3">
      {state?.ok === false ? (
        <p role="alert" className="text-sm text-destructive">
          {state.message}
        </p>
      ) : null}

      <FieldRow label="What is next" hint={fieldErrors?.text}>
        {(id, describedBy) => (
          <Input
            ref={textInputRef}
            id={id}
            name="text"
            defaultValue={initialOpportunity.nextAction ?? ""}
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
            defaultValue={initialOpportunity.nextActionAt ? toLocalInputValue(initialOpportunity.nextActionAt.toISOString()) : null}
            aria-describedby={describedBy}
          />
        )}
      </FieldRow>

      <Button ref={submitRef} type="submit" disabled={pending} className="self-end">
        Save
      </Button>
    </form>
  );
}
