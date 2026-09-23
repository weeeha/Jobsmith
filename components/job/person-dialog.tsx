"use client";

import * as React from "react";
import { toast } from "sonner";

import { addPersonAction, updatePersonAction, unlinkPersonAction } from "@/app/(app)/jobs/[slug]/actions";
import { FieldRow } from "@/components/super-ai/field-row";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { messageFor } from "@/lib/pipeline/messages";
import { focusWasLost } from "@/lib/dom/focus";
import { PERSON_ROLES, type PersonRole } from "@/lib/pipeline/values";
import { PERSON_ROLE_LABELS } from "@/lib/pipeline/labels";
import type { FormState } from "@/lib/forms/state";
import type { PersonInput } from "@/lib/people";

const PERSON_ROLE_ITEMS: Record<string, string> = Object.fromEntries(
  PERSON_ROLES.map((role) => [role, PERSON_ROLE_LABELS[role]]),
);

const ANY_STAGE_LABEL = "Any stage";

// A plain marker attribute, not `data-slot` (the vendored ui/ primitives'
// own styling-slot convention, which this button already carries as
// "button") - this one exists purely so PersonRowActions' Remove handler can
// find this exact DOM node for focus recovery (see its own comment). The
// JSX attribute below and this selector must keep the same name.
const ADD_PERSON_TRIGGER_SELECTOR = "[data-people-add-trigger]";

type PersonDialogMode = { mode: "add" } | { mode: "edit"; linkId: string; initial: PersonInput };

export function PersonDialogTrigger({
  opportunityId,
  stages,
}: {
  opportunityId: string;
  stages: { id: string; label: string }[];
}) {
  const [open, setOpen] = React.useState(false);

  return (
    <>
      <Button data-people-add-trigger="" onClick={() => setOpen(true)}>
        Add person
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          {/* Separate component inside DialogContent, same reasoning as
              edit-company-dialog.tsx's EditCompanyForm: a fresh
              useActionState on every reopen instead of a stale error. */}
          <PersonForm onOpenChange={setOpen} opportunityId={opportunityId} stages={stages} mode={{ mode: "add" }} />
        </DialogContent>
      </Dialog>
    </>
  );
}

interface PersonRowPerson {
  name: string;
  title: string | null;
  linkedinUrl: string | null;
  email: string | null;
  notesMd: string | null;
}

export function PersonRowActions({
  opportunityId,
  linkId,
  person,
  role,
  stageId,
  stages,
}: {
  opportunityId: string;
  linkId: string;
  person: PersonRowPerson;
  role: PersonRole;
  stageId: string | null;
  stages: { id: string; label: string }[];
}) {
  const [editOpen, setEditOpen] = React.useState(false);
  const [, startTransition] = React.useTransition();
  const removeRef = React.useRef<HTMLButtonElement>(null);

  function handleRemove() {
    startTransition(async () => {
      try {
        const result = await unlinkPersonAction(opportunityId, linkId);
        if (!result.ok) {
          toast.error(messageFor(result.code));
          if (focusWasLost()) removeRef.current?.focus();
          return;
        }
        // Success: this row is about to unmount once the revalidated
        // `people` prop lands (mirrors edit-stages-dialog.tsx's StageRow
        // Remove). TabPeople is a server component with no client state of
        // its own, so unlike EditStagesDialogBody - a stable parent that
        // watches the whole `stages` array for exactly this - there is no
        // shared parent here to watch this row's removal, and no later
        // render of THIS component to run an effect in: it will simply be
        // gone. Focus moves to the "Add person" trigger right here instead,
        // synchronously on success rather than waited on, because deletion
        // is already known to be imminent - the user just clicked this
        // exact row's own Remove button.
        document.querySelector<HTMLButtonElement>(ADD_PERSON_TRIGGER_SELECTOR)?.focus();
      } catch (error) {
        // unlinkPersonAction can reject before ever returning a Result -
        // see board.tsx's runMove for the same case. Nothing changed
        // server-side, so this row is still here and still the right thing
        // to recover focus onto.
        console.error("remove person failed", error);
        toast.error(messageFor("unexpected"));
        if (focusWasLost()) removeRef.current?.focus();
      }
    });
  }

  return (
    <>
      <Button variant="outline" size="sm" aria-label={`Edit ${person.name}`} onClick={() => setEditOpen(true)}>
        Edit
      </Button>
      <Button
        ref={removeRef}
        variant="outline"
        size="sm"
        aria-label={`Remove ${person.name} from this job`}
        onClick={handleRemove}
      >
        Remove from this job
      </Button>
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent>
          <PersonForm
            onOpenChange={setEditOpen}
            opportunityId={opportunityId}
            stages={stages}
            mode={{
              mode: "edit",
              linkId,
              initial: {
                name: person.name,
                title: person.title,
                linkedinUrl: person.linkedinUrl,
                email: person.email,
                notesMd: person.notesMd,
                role,
                stageId,
              },
            }}
          />
        </DialogContent>
      </Dialog>
    </>
  );
}

function PersonForm({
  onOpenChange,
  opportunityId,
  stages,
  mode,
}: {
  onOpenChange: (open: boolean) => void;
  opportunityId: string;
  stages: { id: string; label: string }[];
  mode: PersonDialogMode;
}) {
  const action =
    mode.mode === "add"
      ? addPersonAction.bind(null, opportunityId)
      : updatePersonAction.bind(null, opportunityId, mode.linkId);
  const [state, formAction, pending] = React.useActionState<FormState, FormData>(action, undefined);
  const submitRef = React.useRef<HTMLButtonElement>(null);
  // Snapshot, not a live prop read: same reasoning as
  // edit-company-dialog.tsx's `initialCompany` - a save that fails keeps
  // this same mounted form open, and Base UI keeps a successful save's form
  // mounted for its own closing-transition animation, so a live read would
  // hand an uncontrolled field a changed defaultValue while still mounted.
  const [initial] = React.useState<PersonInput | null>(mode.mode === "edit" ? mode.initial : null);

  const stageItems: Record<string, string> = {
    "": ANY_STAGE_LABEL,
    ...Object.fromEntries(stages.map((stage) => [stage.id, stage.label])),
  };

  // Named risk 1: same fix as edit-company-dialog.tsx's EditCompanyForm, see
  // its comment for the full explanation (confirmed empirically against
  // add-job-dialog.tsx/edit-details-dialog.tsx: React 19 runs
  // requestFormReset after every <form action={fn}> dispatch, wiping every
  // uncontrolled field back to its defaultValue even on a validation
  // failure). `noValidate` on top: the Email field below keeps
  // `type="email"` for its keyboard/semantic hint, but this app's own error
  // presentation (the red hint text under a field, from `fieldErrors`) is
  // the only validation UI a user should see here, matching every other
  // field in this dialog - not a browser-native tooltip that would also
  // block the submission before this handler, or the server, ever sees it.
  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    React.startTransition(() => {
      formAction(formData);
    });
  }

  React.useEffect(() => {
    if (state?.ok) {
      onOpenChange(false);
    } else if (state?.ok === false) {
      // Same Chromium disabled-focus-loss fix as every other form here.
      submitRef.current?.focus();
    }
  }, [state, onOpenChange]);

  const fieldErrors = state?.ok === false ? state.fieldErrors : undefined;

  return (
    <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
      <DialogHeader>
        <DialogTitle>{mode.mode === "add" ? "Add a person" : "Edit person"}</DialogTitle>
      </DialogHeader>

      {state?.ok === false ? (
        <p role="alert" className="text-sm text-destructive">
          {state.message}
        </p>
      ) : null}

      <div className="flex max-h-96 flex-col gap-3 overflow-y-auto">
        <FieldRow label="Name" hint={fieldErrors?.name}>
          {(id, describedBy) => (
            <Input
              id={id}
              name="name"
              defaultValue={initial?.name ?? ""}
              aria-describedby={describedBy}
              aria-invalid={Boolean(fieldErrors?.name)}
            />
          )}
        </FieldRow>

        <FieldRow label="Title" hint={fieldErrors?.title}>
          {(id, describedBy) => (
            <Input
              id={id}
              name="title"
              defaultValue={initial?.title ?? ""}
              aria-describedby={describedBy}
              aria-invalid={Boolean(fieldErrors?.title)}
            />
          )}
        </FieldRow>

        <FieldRow label="Role in this process" hint={fieldErrors?.role}>
          {(id) => (
            <Select id={id} name="role" defaultValue={initial?.role ?? PERSON_ROLES[0]} items={PERSON_ROLE_ITEMS}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PERSON_ROLES.map((role) => (
                  <SelectItem key={role} value={role}>
                    {PERSON_ROLE_LABELS[role]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </FieldRow>

        <FieldRow label="Stage" hint={fieldErrors?.stageId}>
          {(id) => (
            <Select id={id} name="stageId" defaultValue={initial?.stageId ?? ""} items={stageItems}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">{ANY_STAGE_LABEL}</SelectItem>
                {stages.map((stage) => (
                  <SelectItem key={stage.id} value={stage.id}>
                    {stage.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </FieldRow>

        <FieldRow label="LinkedIn" hint={fieldErrors?.linkedinUrl}>
          {(id, describedBy) => (
            <Input
              id={id}
              name="linkedinUrl"
              defaultValue={initial?.linkedinUrl ?? ""}
              aria-describedby={describedBy}
              aria-invalid={Boolean(fieldErrors?.linkedinUrl)}
            />
          )}
        </FieldRow>

        <FieldRow label="Email" hint={fieldErrors?.email}>
          {(id, describedBy) => (
            <Input
              id={id}
              type="email"
              name="email"
              defaultValue={initial?.email ?? ""}
              aria-describedby={describedBy}
              aria-invalid={Boolean(fieldErrors?.email)}
            />
          )}
        </FieldRow>

        <FieldRow label="Notes" hint={fieldErrors?.notesMd}>
          {(id, describedBy) => (
            <Textarea
              id={id}
              name="notesMd"
              defaultValue={initial?.notesMd ?? ""}
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
