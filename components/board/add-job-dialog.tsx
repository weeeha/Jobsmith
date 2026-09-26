"use client";

import * as React from "react";
import Link from "next/link";

import { addJobAction } from "@/app/(app)/board/actions";
import { useAnnounce } from "@/components/live-announcer";
import { FieldRow } from "@/components/super-ai/field-row";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { STAGE_KINDS } from "@/lib/pipeline/kinds";
import { submitViaTransition, submitFormData } from "@/lib/forms/submit";
import { draftFor, type AddJobState } from "@/lib/intake/state";
import { PENDING_MESSAGE, addedAnnouncement } from "@/lib/intake/messages";

// Base UI's <Select.Value> resolves its label purely from the Root's own
// `items` prop (node_modules/@base-ui/react/select/value/SelectValue.js:
// resolveSelectedLabel(value, items)), never from having once rendered a
// matching <Select.Item> - without it, a closed Select shows the raw
// stored value ("saved") until the popup has been opened at least once.
// Fixed here so every Select in the app follows the same pattern.
const STAGE_KIND_ITEMS: Record<string, string> = Object.fromEntries(
  STAGE_KINDS.map((stage) => [stage.kind, stage.columnTitle]),
);

// Postgres's `integer` columns (comp_min, comp_max) top out here - matches
// the bound createOpportunitySchema/addJobFormSchema enforce server-side;
// the input's own `max` gives the browser's native stepper/validation the
// same ceiling.
const MAX_COMP = 2_147_483_647;

// The three codes whose alert row reads as an informational, in-between
// state (foreground text) rather than an actual error (destructive text):
// needing more of the posting, needing company and role, or a duplicate
// are none of them a mistake the user made.
function isErrorCode(code: string): boolean {
  return code !== "needs_text" && code !== "needs_details" && code !== "duplicate";
}

interface AddJobDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  companyNames: string[];
}

export function AddJobDialog({ open, onOpenChange, companyNames }: AddJobDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        {/*
          AddJobForm owns useActionState and is a genuinely separate
          component, not inline JSX here, on purpose - see the identical
          reasoning in the Milestone 2 version of this file: AddJobDialog
          itself is a stable sibling in board.tsx that never unmounts, so a
          hook called directly in ITS body would keep its state forever,
          surviving every close/reopen. Base UI's DialogPortal genuinely
          unmounts whatever is inside DialogContent once closed, so a fresh
          AddJobForm - with a fresh useActionState starting at `undefined` -
          mounts the next time it opens.
        */}
        <AddJobForm onOpenChange={onOpenChange} companyNames={companyNames} />
      </DialogContent>
    </Dialog>
  );
}

function computeHadSource(formData: FormData, draft: string): boolean {
  // A draft round-trips the already-resolved posting: addJob uses it
  // instead of resolving again, so no fetch or model call happens even
  // when Link to the posting/Posting text still hold values, and the
  // pending line has nothing true to say in that case.
  if (draft !== "") return false;
  const sourceUrl = String(formData.get("sourceUrl") ?? "").trim();
  const postingText = String(formData.get("postingText") ?? "").trim();
  return sourceUrl !== "" || postingText !== "";
}

function AddJobForm({
  onOpenChange,
  companyNames,
}: {
  onOpenChange: (open: boolean) => void;
  companyNames: string[];
}) {
  const [state, formAction, pending] = React.useActionState<AddJobState, FormData>(addJobAction, undefined);
  const announce = useAnnounce();
  const companyListId = React.useId();

  const formRef = React.useRef<HTMLFormElement>(null);
  const postingTextRef = React.useRef<HTMLTextAreaElement>(null);
  const companyRef = React.useRef<HTMLInputElement>(null);
  const roleRef = React.useRef<HTMLInputElement>(null);
  const submitRef = React.useRef<HTMLButtonElement>(null);
  const addAnywayRef = React.useRef<HTMLButtonElement>(null);

  const [droppedDraft, setDroppedDraft] = React.useState<string | null>(null);
  const draft = draftFor(state, droppedDraft);

  // What the LAST submit (normal or "Add anyway") actually sent, read back
  // by the focus effect below once the action responds - reading live form
  // values at that point would race whatever the user has typed since,
  // since submitFormData never resets the form itself (its whole point:
  // React 19's requestFormReset never fires because this app never wires
  // <form action={dispatch}> directly). Read only from an effect, never
  // from the render body, so a ref is the right container for it.
  const lastSubmitted = React.useRef<{ companyName: string; roleTitle: string }>({
    companyName: "",
    roleTitle: "",
  });

  // Whether that same last submit had a link or text to read, which the
  // pending row below does need at render time (it decides what to show
  // while `pending` is true) - state, not a ref, because render is not
  // allowed to read a ref's current value.
  const [hadSource, setHadSource] = React.useState(false);

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    const data = new FormData(event.currentTarget);
    lastSubmitted.current = {
      companyName: String(data.get("companyName") ?? ""),
      roleTitle: String(data.get("roleTitle") ?? ""),
    };
    setHadSource(computeHadSource(data, draft));
    submitViaTransition(event, formAction);
  }

  function handleAddAnyway() {
    const form = formRef.current;
    if (!form) return;
    const data = new FormData(form);
    lastSubmitted.current = {
      companyName: String(data.get("companyName") ?? ""),
      roleTitle: String(data.get("roleTitle") ?? ""),
    };
    setHadSource(computeHadSource(data, draft));
    submitFormData(form, formAction, { intent: "add_anyway" });
  }

  function handleSourceOrTextChange() {
    if (draft !== "") setDroppedDraft(draft);
  }

  React.useEffect(() => {
    if (state === undefined) return;
    if (state.ok) {
      onOpenChange(false);
      announce(addedAnnouncement(state.data));
      return;
    }
    switch (state.code) {
      case "needs_text":
        postingTextRef.current?.focus();
        break;
      case "needs_details":
        if (lastSubmitted.current.companyName.trim() === "") {
          companyRef.current?.focus();
        } else {
          roleRef.current?.focus();
        }
        break;
      case "duplicate":
        addAnywayRef.current?.focus();
        break;
      default:
        // invalid, server_error and every placement (MoveError) code: the
        // same "focus stays on the control the user just activated"
        // reasoning the earlier dialog already relied on - disabling
        // the button that was just clicked moves focus to <body> in
        // Chromium, and nothing else brings it back on its own once the
        // pending state clears and these field errors render.
        submitRef.current?.focus();
    }
  }, [state, onOpenChange, announce]);

  const fieldErrors = state?.ok === false ? state.fieldErrors : undefined;
  const isDuplicate = state?.ok === false && state.code === "duplicate";
  const showPending = pending && hadSource;

  return (
    // noValidate: this app's own error presentation (the red hint text
    // under a field, from `fieldErrors`) is the only validation UI a user
    // should see here, matching every other form in this milestone.
    <form ref={formRef} onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
      <DialogHeader>
        <DialogTitle>Add a job</DialogTitle>
        <DialogDescription>
          Paste a link or the posting text and Jobsmith fills in what it can. You can also type the
          company and role yourself.
        </DialogDescription>
      </DialogHeader>

      {state?.ok === false ? (
        <div role="alert" className="flex flex-col gap-2 text-sm">
          <p className={isErrorCode(state.code) ? "text-destructive" : "text-foreground"}>{state.message}</p>
          {isDuplicate ? (
            <div className="flex flex-wrap items-center gap-3">
              {state.href ? (
                <Link href={state.href} className="underline underline-offset-4">
                  Open it
                </Link>
              ) : null}
              <Button
                ref={addAnywayRef}
                type="button"
                variant="outline"
                size="sm"
                disabled={pending}
                onClick={handleAddAnyway}
              >
                Add anyway
              </Button>
            </div>
          ) : null}
        </div>
      ) : null}

      <p role="status" className="text-sm text-muted-foreground">
        {showPending ? PENDING_MESSAGE : ""}
      </p>

      {draft !== "" ? <input type="hidden" name="draft" value={draft} /> : null}

      <div className="flex max-h-96 flex-col gap-3 overflow-y-auto">
        <FieldRow label="Link to the posting" hint={fieldErrors?.sourceUrl}>
          {(id, describedBy) => (
            <Input
              id={id}
              type="url"
              name="sourceUrl"
              onChange={handleSourceOrTextChange}
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
              rows={5}
              ref={postingTextRef}
              onChange={handleSourceOrTextChange}
              aria-describedby={describedBy}
              aria-invalid={Boolean(fieldErrors?.postingText)}
            />
          )}
        </FieldRow>

        <FieldRow label="Company" hint={fieldErrors?.companyName}>
          {(id, describedBy) => (
            <>
              <Input
                id={id}
                name="companyName"
                list={companyListId}
                ref={companyRef}
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
              ref={roleRef}
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
          {(id, describedBy) => {
            const legendId = `${id}-legend`;
            return (
              // A plain FieldRow label can't name this control: Base UI's
              // RadioGroup only takes its accessible name from its own
              // Field.Label or Fieldset.Legend context, which neither
              // FieldRow's `<label htmlFor>` nor a bare native
              // <fieldset>/<legend> ever provides - Base UI does not detect
              // a plain HTML fieldset. So the name is wired explicitly with
              // aria-labelledby rather than left to implicit association.
              <fieldset className="contents">
                <legend id={legendId} className="sr-only">
                  Work mode
                </legend>
                <RadioGroup
                  id={id}
                  name="workMode"
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

        <FieldRow label="Pay from" hint={fieldErrors?.compMin}>
          {(id, describedBy) => (
            <Input
              id={id}
              type="number"
              name="compMin"
              max={MAX_COMP}
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
            <Select id={id} name="whereIsItNow" defaultValue="saved" items={STAGE_KIND_ITEMS}>
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
  );
}
