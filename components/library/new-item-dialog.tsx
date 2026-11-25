"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

import { createLibraryItemAction } from "@/app/(app)/library/actions";
import { ChipField } from "@/components/chip-field";
import { useAnnounce } from "@/components/live-announcer";
import { NativeSelect } from "@/components/native-select";
import { FieldRow } from "@/components/super-ai/field-row";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { submitViaTransition } from "@/lib/forms/submit";
import type { FormStateWith } from "@/lib/forms/state";
import { LIBRARY_COPY } from "@/lib/library/copy";
import { HAND_CREATED_KINDS } from "@/lib/library/items";

// The "New item" button and its dialog. Answers come from questions, so the
// kinds here are story, intro and fact only.
export function NewItemDialog(): React.ReactElement {
  const [open, setOpen] = React.useState(false);
  return (
    <>
      <Button type="button" variant="outline" size="sm" onClick={() => setOpen(true)}>
        {LIBRARY_COPY.newItem}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          {/* A separate component, so a fresh form state mounts each time the dialog opens. */}
          <NewItemForm onClose={() => setOpen(false)} />
        </DialogContent>
      </Dialog>
    </>
  );
}

function NewItemForm({ onClose }: { onClose: () => void }): React.ReactElement {
  const router = useRouter();
  const announce = useAnnounce();
  const [state, formAction, pending] = React.useActionState<FormStateWith<{ id: string }>, FormData>(
    createLibraryItemAction,
    undefined,
  );
  const titleRef = React.useRef<HTMLInputElement>(null);
  const bodyRef = React.useRef<HTMLTextAreaElement>(null);
  const submitRef = React.useRef<HTMLButtonElement>(null);

  React.useEffect(() => {
    if (state === undefined) return;
    if (state.ok) {
      announce("Item created.");
      router.refresh();
      onClose();
      return;
    }
    // Focus the first field in error; Save stays enabled-after-pending so it can take focus back.
    if (state.fieldErrors?.title) titleRef.current?.focus();
    else if (state.fieldErrors?.bodyMd) bodyRef.current?.focus();
    else submitRef.current?.focus();
  }, [state, announce, router, onClose]);

  const errors = state?.ok === false ? state.fieldErrors : undefined;
  const f = LIBRARY_COPY.fields;

  return (
    <form onSubmit={(event) => submitViaTransition(event, formAction)} noValidate className="flex flex-col gap-4">
      <DialogHeader>
        <DialogTitle>{LIBRARY_COPY.newItemTitle}</DialogTitle>
        <DialogDescription>Add a story, an intro or a fact you reuse across jobs.</DialogDescription>
      </DialogHeader>

      {state?.ok === false && !state.fieldErrors ? (
        <p role="alert" className="text-sm text-destructive">
          {state.message}
        </p>
      ) : null}

      <div className="flex max-h-96 flex-col gap-3 overflow-y-auto">
        <FieldRow label={f.kind} hint={errors?.kind}>
          {(id, describedBy) => (
            <NativeSelect id={id} name="kind" defaultValue="story" aria-describedby={describedBy} aria-invalid={Boolean(errors?.kind)}>
              {HAND_CREATED_KINDS.map((kind) => (
                <option key={kind} value={kind}>
                  {LIBRARY_COPY.kinds[kind]}
                </option>
              ))}
            </NativeSelect>
          )}
        </FieldRow>
        <FieldRow label={f.title} hint={errors?.title}>
          {(id, describedBy) => (
            <Input id={id} ref={titleRef} name="title" aria-describedby={describedBy} aria-invalid={Boolean(errors?.title)} />
          )}
        </FieldRow>
        <FieldRow label={f.body} hint={errors?.bodyMd}>
          {(id, describedBy) => (
            <Textarea id={id} ref={bodyRef} name="bodyMd" rows={6} className="min-w-0" aria-describedby={describedBy} aria-invalid={Boolean(errors?.bodyMd)} />
          )}
        </FieldRow>
        <FieldRow label={f.tags} hint={errors?.tags ?? "Up to 20 tags, each up to 80 characters."}>
          {(id, describedBy) => <ChipField id={id} name="tags" aria-describedby={describedBy} invalid={Boolean(errors?.tags)} />}
        </FieldRow>
      </div>

      <DialogFooter>
        <Button ref={submitRef} type="submit" disabled={pending}>
          {LIBRARY_COPY.create}
        </Button>
        <Button type="button" variant="outline" onClick={onClose}>
          {LIBRARY_COPY.cancel}
        </Button>
      </DialogFooter>
    </form>
  );
}
