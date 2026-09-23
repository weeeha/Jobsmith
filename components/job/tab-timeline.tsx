"use client";

import * as React from "react";

import { addNoteAction } from "@/app/(app)/jobs/[slug]/actions";
import { FieldRow } from "@/components/super-ai/field-row";
import { EmptyState } from "@/components/super-ai/empty-state";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { LocalTime } from "@/components/local-time";
import { eventText } from "@/lib/pipeline/event-text";
import type { FormState } from "@/lib/forms/state";
import type { EventRow } from "@/lib/db/scoped";

// The whole file is "use client", the same shape as next-action-bar.tsx
// (Task 10): a mostly-static list with one small interactive form nested
// inside it, in one exported component's tree. `events` is already
// server-fetched, plain, serializable data by the time it reaches here (like
// NextActionBar's own `opportunity` prop or board.tsx's `cards`), so there
// is nothing server-only left for a separate server wrapper to do.
export function TabTimeline({
  opportunityId,
  events,
}: {
  opportunityId: string;
  // Already newest-first, per s.event.listForOpportunity's own contract
  // (occurred_at desc, then created_at desc, Task 2) - never re-sorted here.
  events: EventRow[];
}) {
  return (
    <section aria-label="Timeline" className="flex flex-col gap-4 py-4">
      <NoteForm opportunityId={opportunityId} />

      {events.length === 0 ? (
        <EmptyState size="panel" title="Nothing here yet." />
      ) : (
        <ol className="flex flex-col gap-2">
          {events.map((event) => (
            <li key={event.id} className="flex flex-col gap-0.5 rounded-lg border border-border p-3">
              <p className="text-xs text-muted-foreground">
                <LocalTime value={event.occurredAt} mode="datetime" />
              </p>
              {/* break-words: a note's body can be an unbroken long string
                  (named risk 3, e.g. a pasted URL with no spaces) with no
                  other wrap point, which would otherwise force page-level
                  horizontal overflow. */}
              <p className="break-words text-sm text-foreground">{eventText(event)}</p>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

function NoteForm({ opportunityId }: { opportunityId: string }) {
  const [state, formAction, pending] = React.useActionState<FormState, FormData>(
    addNoteAction.bind(null, opportunityId),
    undefined,
  );
  const formRef = React.useRef<HTMLFormElement>(null);
  const submitRef = React.useRef<HTMLButtonElement>(null);

  // Named risk 1: same fix as edit-company-dialog.tsx/person-dialog.tsx -
  // see EditCompanyForm's comment for the full explanation (confirmed
  // empirically against add-job-dialog.tsx/edit-details-dialog.tsx: React 19
  // runs requestFormReset after every <form action={fn}> dispatch, wiping
  // every uncontrolled field back to its defaultValue). This form does not
  // close on success (there is nothing to close - the frame just says it
  // clears), so avoiding requestFormReset means the clearing it still needs
  // has to be done explicitly below, rather than left to that same
  // mechanism.
  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    React.startTransition(() => {
      formAction(formData);
    });
  }

  React.useEffect(() => {
    if (state === undefined) return;
    if (state.ok) formRef.current?.reset();
    // Same Chromium disabled-focus-loss fix as every other form here: the
    // Add note button is disabled only while pending, never removed, so it
    // is reachable to refocus on both outcomes (matches
    // stage-detail-sheet.tsx's identical "refocuses on both outcomes").
    submitRef.current?.focus();
  }, [state]);

  const fieldErrors = state?.ok === false ? state.fieldErrors : undefined;

  return (
    <form ref={formRef} onSubmit={handleSubmit} className="flex flex-col gap-2">
      {state?.ok === false ? (
        <p role="alert" className="text-sm text-destructive">
          {state.message}
        </p>
      ) : null}

      <FieldRow label="Add a note" hint={fieldErrors?.body}>
        {(id, describedBy) => (
          <Textarea id={id} name="body" aria-describedby={describedBy} aria-invalid={Boolean(fieldErrors?.body)} />
        )}
      </FieldRow>

      <Button ref={submitRef} type="submit" disabled={pending} className="self-end">
        Add note
      </Button>
    </form>
  );
}
