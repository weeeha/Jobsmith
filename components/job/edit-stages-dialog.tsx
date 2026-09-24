"use client";

import * as React from "react";
import { toast } from "sonner";

import {
  renameStageAction,
  addStageAction,
  reorderStagesAction,
  skipStageAction,
  unskipStageAction,
  removeStageAction,
} from "@/app/(app)/jobs/[slug]/actions";
import { FieldRow } from "@/components/super-ai/field-row";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { STAGE_KINDS, type StageKind } from "@/lib/pipeline/kinds";
import { columnTitle } from "@/lib/pipeline/labels";
import { messageFor } from "@/lib/pipeline/messages";
import { focusWasLost } from "@/lib/dom/focus";
import { submitViaTransition } from "@/lib/forms/submit";
import type { StageControls } from "@/lib/pipeline/stage-controls";
import type { StageStatus } from "@/lib/pipeline/values";
import type { FormState } from "@/lib/forms/state";

const ADDABLE_STAGE_KINDS = STAGE_KINDS.filter(
  (k) => k.kind !== "saved" && k.kind !== "applied" && k.kind !== "offer",
);

// Base UI's <Select.Value> resolves its label purely from the Root's own
// `items` prop (node_modules/@base-ui/react/select/value/SelectValue.js:
// resolveSelectedLabel(value, items) - verified by reading the source, not
// guessed), never from having once rendered a matching <Select.Item>.
// Without it, a closed Select shows the raw value ("recruiter_screen")
// until the user opens the popup at least once. `columnTitle` is already
// imported for the option list below; this is the same map, keyed for
// `items` instead of iterated for children.
const ADDABLE_STAGE_KIND_ITEMS: Record<string, string> = Object.fromEntries(
  ADDABLE_STAGE_KINDS.map((entry) => [entry.kind, columnTitle(entry.kind)]),
);

type EditStagesStage = { id: string; kind: StageKind; label: string; status: StageStatus };

interface EditStagesDialogProps {
  open: boolean;
  onOpenChange(open: boolean): void;
  opportunity: { id: string };
  stages: EditStagesStage[];
  controls: Record<string, StageControls>;
}

export function EditStagesDialog({ open, onOpenChange, opportunity, stages, controls }: EditStagesDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <EditStagesDialogBody onOpenChange={onOpenChange} opportunity={opportunity} stages={stages} controls={controls} />
      </DialogContent>
    </Dialog>
  );
}

function EditStagesDialogBody({
  onOpenChange,
  opportunity,
  stages,
  controls,
}: Omit<EditStagesDialogProps, "open">) {
  // A stable fallback focus target for Remove: that row's own inputs are
  // about to unmount (the removed stage drops out of the `stages` prop on
  // the next render), so there is nothing left in the row itself to
  // refocus.
  const doneRef = React.useRef<HTMLButtonElement>(null);
  const prevStageIdsRef = React.useRef(new Set(stages.map((s) => s.id)));

  // Runs after the `stages` prop actually changes - i.e., after React has
  // committed whatever DOM removal a successful Remove caused - which is
  // the correct moment to ask document.activeElement anything. Checking
  // synchronously right after removeStageAction's own promise resolves is
  // too early: that promise settles as soon as the server action returns,
  // before Next.js has re-fetched and applied the revalidated page, so the
  // row is usually still mounted (and still focused) at that instant. This
  // was confirmed empirically: an immediate post-await check missed a real
  // case in manual testing (see the report's self-review notes).
  React.useEffect(() => {
    const currentIds = new Set(stages.map((s) => s.id));
    const aStageWasRemoved = [...prevStageIdsRef.current].some((id) => !currentIds.has(id));
    prevStageIdsRef.current = currentIds;
    if (aStageWasRemoved && focusWasLost()) {
      doneRef.current?.focus();
    }
  }, [stages]);

  function orderedIdsSwapping(index: number, neighborIndex: number): string[] {
    const ids = stages.map((s) => s.id);
    const a = ids[index]!;
    const b = ids[neighborIndex]!;
    ids[index] = b;
    ids[neighborIndex] = a;
    return ids;
  }

  return (
    <div className="flex flex-col gap-4">
      <DialogHeader>
        <DialogTitle>Edit stages</DialogTitle>
      </DialogHeader>

      {/* max-h-96 + overflow-y-auto, same convention as add-job-dialog.tsx's
          own field list: DialogContent's Popup sets no max-height of its
          own, so seven-plus stage rows (each a form and four buttons, with
          a reason line next to any disabled one) plus the Add-a-stage
          section can render taller than the viewport with nothing to
          scroll it - confirmed empirically: the Add-stage button was
          genuinely unreachable in a real browser before this was added
          (see the report). DialogHeader and DialogFooter stay outside this
          scroll region, so the title and Done stay put. */}
      <div className="flex max-h-96 flex-col gap-4 overflow-y-auto">
        <ol className="flex flex-col gap-2">
          {stages.map((stage, index) => (
            <StageRow
              key={stage.id}
              opportunity={opportunity}
              stage={stage}
              controls={controls[stage.id]!}
              onMoveUp={() => orderedIdsSwapping(index, index - 1)}
              onMoveDown={() => orderedIdsSwapping(index, index + 1)}
            />
          ))}
        </ol>

        <AddStageSection opportunity={opportunity} />
      </div>

      <DialogFooter>
        <Button ref={doneRef} onClick={() => onOpenChange(false)}>
          Done
        </Button>
      </DialogFooter>
    </div>
  );
}

function StageRow({
  opportunity,
  stage,
  controls,
  onMoveUp,
  onMoveDown,
}: {
  opportunity: { id: string };
  stage: EditStagesStage;
  controls: StageControls;
  onMoveUp: () => string[];
  onMoveDown: () => string[];
}) {
  const [renameState, renameAction] = React.useActionState<FormState, FormData>(
    renameStageAction.bind(null, opportunity.id, stage.id),
    undefined,
  );
  const [, startTransition] = React.useTransition();
  const labelInputRef = React.useRef<HTMLInputElement>(null);
  const prevControlsRef = React.useRef(controls);
  // Controlled, not defaultValue: this row (and its Input) stays mounted
  // across a successful rename - the same "uncontrolled control receiving
  // a changed default after mount" case as stage-detail-sheet.tsx's
  // Format Select, confirmed empirically the same way (Base UI: "A
  // component is changing the default value state of an uncontrolled
  // FieldControl after being initialized"). No sync effect is needed: the
  // user's own last edit already matches whatever the server just echoed
  // back.
  const [labelValue, setLabelValue] = React.useState(stage.label);

  // A Move/Skip button is gated only by `controls`, recomputed server-side
  // from the same pure rules after every action resolves - so the very
  // button just clicked can become disabled the moment the new `controls`
  // prop arrives (a Move up that reaches the top, for example). A disabled
  // Base UI Button cannot hold focus, and the browser sends focus to
  // <body> rather than leaving it in place.
  //
  // This has to be a `useEffect` keyed on `controls`, not a check made
  // synchronously right after the triggering action's own promise
  // resolves: that promise settles as soon as the server action returns,
  // which is BEFORE Next.js has re-fetched and applied the revalidated
  // page's new `controls` prop, so a same-tick check almost always finds
  // the old (still-enabled) button and does nothing - confirmed
  // empirically in manual testing, where an earlier, synchronous version
  // of this check missed a real Move-up-into-disabled case (see the task
  // report). An effect keyed on `controls` only runs after React commits
  // the render that actually applied the new value, which is the first
  // point document.activeElement can be trusted.
  React.useEffect(() => {
    const prev = prevControlsRef.current;
    const newlyDisabled =
      (prev.moveUp.allowed && !controls.moveUp.allowed) ||
      (prev.moveDown.allowed && !controls.moveDown.allowed) ||
      (prev.skip.allowed && !controls.skip.allowed) ||
      (prev.remove.allowed && !controls.remove.allowed);
    prevControlsRef.current = controls;
    if (newlyDisabled && focusWasLost()) {
      labelInputRef.current?.focus();
    }
  }, [controls]);

  function runMoveUp() {
    if (!controls.moveUp.allowed) return;
    const orderedIds = onMoveUp();
    startTransition(async () => {
      try {
        const result = await reorderStagesAction(opportunity.id, orderedIds);
        if (!result.ok) toast.error(messageFor(result.code));
      } catch (error) {
        // reorderStagesAction can reject before ever returning a Result -
        // see board.tsx's runMove for the same case. `controls` never
        // changes when that happens, so there is nothing for the effect
        // above to recover: the button the user clicked is still exactly
        // as enabled as it was.
        console.error("reorder failed", error);
        toast.error(messageFor("unexpected"));
      }
    });
  }

  function runMoveDown() {
    if (!controls.moveDown.allowed) return;
    const orderedIds = onMoveDown();
    startTransition(async () => {
      try {
        const result = await reorderStagesAction(opportunity.id, orderedIds);
        if (!result.ok) toast.error(messageFor(result.code));
      } catch (error) {
        console.error("reorder failed", error);
        toast.error(messageFor("unexpected"));
      }
    });
  }

  function runSkipOrUnskip() {
    if (!controls.skip.allowed) return;
    const wasSkipped = stage.status === "skipped";
    startTransition(async () => {
      try {
        const result = wasSkipped
          ? await unskipStageAction(opportunity.id, stage.id)
          : await skipStageAction(opportunity.id, stage.id);
        if (!result.ok) toast.error(messageFor(result.code));
      } catch (error) {
        console.error(`${wasSkipped ? "unskip" : "skip"} failed`, error);
        toast.error(messageFor("unexpected"));
      }
    });
  }

  function runRemove() {
    if (!controls.remove.allowed) return;
    startTransition(async () => {
      // Success: this row is about to unmount once the new `stages` prop
      // lands. Recovering focus onto the dialog's Done button then is the
      // parent's job (EditStagesDialogBody watches `stages` for exactly
      // this), since this component will not be around to run its own
      // effect by that point. A rejection below never reaches that point
      // (nothing changed), so the row - and this catch - are still here.
      try {
        const result = await removeStageAction(opportunity.id, stage.id);
        if (!result.ok) toast.error(messageFor(result.code));
      } catch (error) {
        console.error("remove failed", error);
        toast.error(messageFor("unexpected"));
      }
    });
  }

  const renameError = renameState?.ok === false ? renameState.fieldErrors?.label ?? renameState.message : undefined;

  return (
    <li className="flex flex-wrap items-center gap-2 rounded-lg border border-border p-2">
      {/* Converted from <form action={renameAction}> to submitViaTransition
          (lib/forms/submit.ts), same as every other form here - the onBlur
          below still submits via the native form.requestSubmit(), which
          now dispatches through this onSubmit instead of the native
          action path. */}
      <form onSubmit={(event) => submitViaTransition(event, renameAction)} className="min-w-0 flex-1">
        <Input
          ref={labelInputRef}
          name="label"
          value={labelValue}
          onChange={(event) => setLabelValue(event.target.value)}
          aria-label={`Rename ${stage.label}`}
          aria-invalid={Boolean(renameError)}
          onBlur={(event) => event.currentTarget.form?.requestSubmit()}
        />
        {renameError ? (
          <p role="alert" className="mt-1 text-xs text-destructive">
            {renameError}
          </p>
        ) : null}
      </form>

      <div className="flex flex-wrap items-center gap-1.5">
        <Button
          variant="outline"
          size="sm"
          aria-label={`Move ${stage.label} up`}
          disabled={!controls.moveUp.allowed}
          onClick={runMoveUp}
        >
          Move up
        </Button>
        {!controls.moveUp.allowed ? <span className="text-xs text-muted-foreground">{controls.moveUp.reason}</span> : null}

        <Button
          variant="outline"
          size="sm"
          aria-label={`Move ${stage.label} down`}
          disabled={!controls.moveDown.allowed}
          onClick={runMoveDown}
        >
          Move down
        </Button>
        {!controls.moveDown.allowed ? (
          <span className="text-xs text-muted-foreground">{controls.moveDown.reason}</span>
        ) : null}

        <Button
          variant="outline"
          size="sm"
          aria-label={stage.status === "skipped" ? `Unskip ${stage.label}` : `Skip ${stage.label}`}
          disabled={!controls.skip.allowed}
          onClick={runSkipOrUnskip}
        >
          {stage.status === "skipped" ? "Unskip" : "Skip"}
        </Button>
        {!controls.skip.allowed ? <span className="text-xs text-muted-foreground">{controls.skip.reason}</span> : null}

        <Button
          variant="outline"
          size="sm"
          aria-label={`Remove ${stage.label}`}
          disabled={!controls.remove.allowed}
          onClick={runRemove}
        >
          Remove
        </Button>
        {!controls.remove.allowed ? (
          <span className="text-xs text-muted-foreground">{controls.remove.reason}</span>
        ) : null}
      </div>
    </li>
  );
}

function AddStageSection({ opportunity }: { opportunity: { id: string } }) {
  const [state, formAction, pending] = React.useActionState<FormState, FormData>(
    addStageAction.bind(null, opportunity.id),
    undefined,
  );
  const formRef = React.useRef<HTMLFormElement>(null);
  const submitRef = React.useRef<HTMLButtonElement>(null);

  React.useEffect(() => {
    // This section never unmounts while the dialog is open (unlike
    // AddJobForm/EditDetailsForm, it has nowhere to unmount to - there is
    // no separate dialog to close), so a successful add needs its own
    // reset: otherwise the Label field would keep showing the stage that
    // was just added. Both outcomes refocus Add stage, matching stage-
    // detail-sheet's Save: the button is disabled only while pending, and
    // never removed, so the Chromium disabled-focus-to-<body> bug applies
    // either way.
    if (state !== undefined) {
      if (state.ok) formRef.current?.reset();
      submitRef.current?.focus();
    }
  }, [state]);

  const fieldErrors = state?.ok === false ? state.fieldErrors : undefined;

  return (
    <div className="flex flex-col gap-3 border-t border-border pt-4">
      <h3 className="text-sm font-medium text-foreground">Add a stage</h3>
      {/* Converted from <form action={formAction}> to submitViaTransition
          (lib/forms/submit.ts) - requestFormReset was reverting a chosen
          (non-default) "Kind" back to ADDABLE_STAGE_KINDS[0] after a
          rejected submit (a blank Label, say), not just leaving it as the
          user picked it. */}
      <form ref={formRef} onSubmit={(event) => submitViaTransition(event, formAction)} className="flex flex-col gap-3">
        {state?.ok === false ? (
          <p role="alert" className="text-sm text-destructive">
            {state.message}
          </p>
        ) : null}

        <FieldRow label="Kind" hint={fieldErrors?.kind}>
          {(id) => (
            <Select id={id} name="kind" defaultValue={ADDABLE_STAGE_KINDS[0]?.kind} items={ADDABLE_STAGE_KIND_ITEMS}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ADDABLE_STAGE_KINDS.map((entry) => (
                  <SelectItem key={entry.kind} value={entry.kind}>
                    {columnTitle(entry.kind)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </FieldRow>

        <FieldRow label="Label" hint={fieldErrors?.label}>
          {(id, describedBy) => (
            <Input id={id} name="label" aria-describedby={describedBy} aria-invalid={Boolean(fieldErrors?.label)} />
          )}
        </FieldRow>

        <Button ref={submitRef} type="submit" disabled={pending} className="self-end">
          Add stage
        </Button>
      </form>
    </div>
  );
}
