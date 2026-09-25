"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { pasteDocumentAction } from "@/app/(app)/jobs/[slug]/document-actions";
import { formatDocRef } from "@/lib/artifacts/tabs";
import { ARTIFACT_KINDS, type ArtifactKind } from "@/lib/artifacts/kinds";
import type { PasteTarget } from "@/lib/artifacts/paste";
import type { PasteFormState } from "@/lib/artifacts/forms";
import type { ArtifactScope } from "@/lib/artifacts/values";
import { messageFor } from "@/lib/pipeline/messages";
import { submitViaTransition } from "@/lib/forms/submit";
import { correctFocusOnceLost } from "@/lib/dom/focus";
import { useAnnounce } from "@/components/live-announcer";
import { FieldRow } from "@/components/super-ai/field-row";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export function PasteDialogTrigger(props: {
  opportunityId: string;
  target: PasteTarget;
  defaultKind: ArtifactKind;
  stages: { id: string; label: string }[];
  initial?: { title: string; kind: ArtifactKind; stageId: string | null };
  label: string;
  ariaLabel?: string;
  variant?: React.ComponentProps<typeof Button>["variant"];
}): React.ReactElement {
  const [open, setOpen] = React.useState(false);

  return (
    <>
      <Button variant={props.variant} aria-label={props.ariaLabel ?? props.label} onClick={() => setOpen(true)}>
        {props.label}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          {/* Separate component inside DialogContent, same reasoning as
              edit-company-dialog.tsx's EditCompanyForm: the Popup unmounts
              its children while closed, so every reopen starts a fresh
              useActionState instead of a previous attempt's stale error or
              stale typed body. */}
          <PasteForm
            onOpenChange={setOpen}
            opportunityId={props.opportunityId}
            target={props.target}
            defaultKind={props.defaultKind}
            stages={props.stages}
            initial={props.initial}
          />
        </DialogContent>
      </Dialog>
    </>
  );
}

function PasteForm({
  onOpenChange,
  opportunityId,
  target,
  defaultKind,
  stages,
  initial,
}: {
  onOpenChange: (open: boolean) => void;
  opportunityId: string;
  target: PasteTarget;
  defaultKind: ArtifactKind;
  stages: { id: string; label: string }[];
  initial?: { title: string; kind: ArtifactKind; stageId: string | null };
}) {
  // A brand-new paste always lands in job scope (pasteArtifact hard-codes
  // this in its own new-document branch), so only "paste a new version" of
  // an existing company-scoped document (Research's shared documents) is
  // ever company-scoped here.
  const scope: ArtifactScope = target.mode === "version" ? target.scope : "opportunity";
  const kindItems: Record<string, string> = Object.fromEntries(
    (scope === "company" ? ARTIFACT_KINDS.filter((k) => k.companyWide) : ARTIFACT_KINDS).map((k) => [k.kind, k.label]),
  );
  const stageItems: Record<string, string> = {
    "": "No stage",
    ...Object.fromEntries(stages.map((st) => [st.id, st.label])),
  };

  const action = pasteDocumentAction.bind(null, opportunityId, target);
  const [state, formAction, pending] = React.useActionState<PasteFormState, FormData>(action, undefined);
  const router = useRouter();
  const announce = useAnnounce();
  const submitRef = React.useRef<HTMLButtonElement>(null);
  // Captured synchronously in onSubmit: PasteFormState's own failure branch
  // carries no title back, but the failure toast still needs to name the
  // document the user was trying to save.
  const lastTitleRef = React.useRef("");

  React.useEffect(() => {
    if (state?.ok) {
      const sentence =
        state.data.status === "created" || state.data.status === "edited"
          ? `Saved ${state.data.title}.`
          : state.data.status === "versioned"
            ? `Saved ${state.data.title} as version ${state.data.version}.`
            : state.data.status === "updated"
              ? `Updated the details of ${state.data.title}.`
              : // The only other status is "unchanged". Besides a plain no-op
                // paste, this also fires when the text matches the latest but
                // the title, kind or stage changed on a version that was
                // already sent (state.data.warnings then carries sent_locked);
                // the same plain sentence covers both today.
                "Nothing changed. This text is already the latest version.";
      // Warnings come after the success sentence, in the same announcement:
      // the live region only holds one message at a time, so a second,
      // separate announce() call here would just overwrite the first before
      // assistive tech had a chance to read it rather than queue behind it.
      announce([sentence, ...state.data.warnings.map((warning) => warning.message)].join(" "));
      onOpenChange(false);
      // A bare query string, resolved against whatever path is already open -
      // no basePath needed here, unlike DocumentList's server-rendered links.
      router.push(
        `?tab=${state.data.tab}&doc=${formatDocRef({ scope: state.data.scope, key: state.data.key })}`,
        { scroll: false },
      );
      // A save whose kind belongs to a different tab than the one this
      // dialog was opened from navigates there, which unmounts this trigger
      // along with the rest of the old tab's tree - Base UI's own
      // close-focus restoration then has nothing left to land focus on.
      // This is a no-op whenever focus already made it back to the trigger,
      // the ordinary same-tab case.
      correctFocusOnceLost(() => {
        document.querySelector<HTMLElement>("[data-document-title]")?.focus();
      });
    } else if (state?.ok === false) {
      if (state.code !== "invalid") {
        // Not a field the user can fix by looking at this form - the job or
        // the specific document this dialog targets no longer exists (an
        // unusual concurrent-edit case, not something a person types wrong).
        toast.error(`Could not save ${lastTitleRef.current || "the document"}. ${messageFor(state.code)}`);
      }
      // Chromium disabled-focus-loss fix, same as every other form here:
      // Save is disabled only while pending, never removed, so it is
      // reachable to refocus on every failure, field-level or not.
      submitRef.current?.focus();
    }
  }, [state, onOpenChange, announce, router]);

  const fieldErrors = state?.ok === false ? state.fieldErrors : undefined;
  const dialogTitle = target.mode === "new" ? "Paste markdown" : "Paste a new version";

  return (
    <form
      onSubmit={(event) => {
        lastTitleRef.current = String(new FormData(event.currentTarget).get("title") ?? "");
        submitViaTransition(event, formAction);
      }}
      noValidate
      // min-w-0: the dialog surface (components/ui/dialog.tsx) is a CSS
      // grid with no column width of its own, so its one column sizes
      // itself to fit this form. Without min-w-0 here, an unbroken value in
      // the Markdown field below (nothing to wrap on) makes that column -
      // and this whole form, footer included - grow to fit it instead of
      // staying inside the dialog. With it, the form stays the dialog's
      // width and an unbroken value instead scrolls sideways within the
      // fields area above, which already scrolls vertically the same way.
      className="min-w-0 flex flex-col gap-4"
    >
      <DialogHeader>
        <DialogTitle>{dialogTitle}</DialogTitle>
      </DialogHeader>

      {state?.ok === false ? (
        <p role="alert" className="text-sm text-destructive">
          {state.message}
        </p>
      ) : null}

      <div className="flex max-h-96 flex-col gap-3 overflow-y-auto">
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

        <FieldRow label="Kind" hint={fieldErrors?.kind}>
          {(id) => (
            <Select id={id} name="kind" items={kindItems} defaultValue={initial?.kind ?? defaultKind}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(kindItems).map(([value, label]) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </FieldRow>

        {/* A company-shared document has no stage, enforced in the
            database by artifact_company_stage_check. */}
        {scope !== "company" ? (
          <FieldRow label="Stage" hint={fieldErrors?.stageId}>
            {(id) => (
              <Select id={id} name="stageId" items={stageItems} defaultValue={initial?.stageId ?? ""}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">No stage</SelectItem>
                  {stages.map((stage) => (
                    <SelectItem key={stage.id} value={stage.id}>
                      {stage.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </FieldRow>
        ) : null}

        <FieldRow label="Markdown" hint={fieldErrors?.bodyMd}>
          {(id, describedBy) => (
            <Textarea
              id={id}
              name="bodyMd"
              rows={12}
              // This field-sizing-content textarea sizes itself to fit its
              // value, and with no spaces to wrap on, that can be wider
              // than its row. min-w-0 lets it shrink back down to the row
              // instead of forcing the row wider. On its own this was not
              // enough to keep the dialog from growing too - see the min-w-0
              // on this form's own opening tag above for the rest of the fix.
              className="min-w-0 font-mono break-words"
              defaultValue=""
              aria-describedby={describedBy}
              aria-invalid={Boolean(fieldErrors?.bodyMd)}
            />
          )}
        </FieldRow>
      </div>

      <DialogFooter>
        <Button ref={submitRef} type="submit" disabled={pending}>
          Save
        </Button>
        <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
          Cancel
        </Button>
      </DialogFooter>
    </form>
  );
}
