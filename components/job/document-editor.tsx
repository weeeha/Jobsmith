"use client";

import * as React from "react";
import { toast } from "sonner";

import { saveDocumentEditAction } from "@/app/(app)/jobs/[slug]/document-actions";
import { useAnnounce } from "@/components/live-announcer";
import { Markdown } from "@/components/markdown";
import { FieldRow } from "@/components/super-ai/field-row";
import { ModeTabs } from "@/components/super-ai/mode-tabs";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { submitViaTransition } from "@/lib/forms/submit";
import { messageFor } from "@/lib/pipeline/messages";
import type { EditFormState } from "@/lib/artifacts/forms";

export function DocumentEditor(props: {
  opportunityId: string;
  documentKey: string;
  version: number;
  bodyMd: string;
  renderedBody: React.ReactNode;
  isSent: boolean;
  title: string;
}): React.ReactElement {
  const [editing, setEditing] = React.useState(false);
  // Bumped every time Edit is clicked and used to key the form below, so
  // each edit session gets its own fresh component instance instead of the
  // same one carrying state over from the last session. A save that failed
  // left its validation error (and aria-invalid) sitting in that instance's
  // useActionState forever otherwise - the instance itself never went away
  // between edits, only the surrounding markup toggled.
  const [session, setSession] = React.useState(0);
  // Captured when Edit opens, not read live from props.version: a push can
  // land a newer version in the background while this form stays open, and
  // the save must still say which version it was edited against.
  const [baseVersion, setBaseVersion] = React.useState(props.version);
  const editRef = React.useRef<HTMLButtonElement>(null);

  // "Edit" unmounts itself the instant it is clicked (the branch below
  // switches to the form), so a naive "focus the thing that was just
  // clicked" cannot work for either direction - the same idiom
  // next-action-bar.tsx uses for its own editing toggle. Closing moves
  // focus back to Edit, handled here; opening moves focus into the form,
  // handled by the form's own mount below, since a fresh instance is
  // exactly what clicking Edit now produces.
  const wasEditing = React.useRef(false);
  React.useEffect(() => {
    if (editing) {
      wasEditing.current = true;
      return;
    }
    if (wasEditing.current) {
      wasEditing.current = false;
      editRef.current?.focus();
    }
  }, [editing]);

  const closeEditor = React.useCallback(() => setEditing(false), []);

  if (!editing) {
    return (
      <div className="flex flex-col gap-3">
        {props.renderedBody}
        <div className="flex flex-wrap items-center gap-2">
          <Button
            ref={editRef}
            variant="outline"
            size="sm"
            data-document-edit=""
            aria-label={`Edit ${props.title}`}
            onClick={() => {
              setBaseVersion(props.version);
              setSession((current) => current + 1);
              setEditing(true);
            }}
          >
            Edit
          </Button>
        </div>
      </div>
    );
  }

  return (
    <EditForm
      key={session}
      opportunityId={props.opportunityId}
      documentKey={props.documentKey}
      baseVersion={baseVersion}
      bodyMd={props.bodyMd}
      version={props.version}
      isSent={props.isSent}
      onClose={closeEditor}
    />
  );
}

function EditForm({
  opportunityId,
  documentKey,
  baseVersion,
  bodyMd,
  version,
  isSent,
  onClose,
}: {
  opportunityId: string;
  documentKey: string;
  baseVersion: number;
  bodyMd: string;
  version: number;
  isSent: boolean;
  onClose: () => void;
}): React.ReactElement {
  const [mode, setMode] = React.useState<"write" | "preview">("write");
  const [draft, setDraft] = React.useState(bodyMd);
  const action = saveDocumentEditAction.bind(null, opportunityId, documentKey, baseVersion);
  const [state, formAction, pending] = React.useActionState<EditFormState, FormData>(action, undefined);
  const announce = useAnnounce();
  const submitRef = React.useRef<HTMLButtonElement>(null);
  const textareaRef = React.useRef<HTMLTextAreaElement>(null);

  // This component only ever exists because Edit was just clicked - the
  // parent gives it a fresh key for every session - so the textarea always
  // wants focus the moment it mounts, with no condition to check.
  React.useEffect(() => {
    textareaRef.current?.focus();
  }, []);

  React.useEffect(() => {
    if (state?.ok) {
      const sentence =
        state.data.status === "edited"
          ? `Saved ${state.data.title}.`
          : state.data.status === "versioned"
            ? `Saved ${state.data.title} as version ${state.data.version}.`
            : "No changes to save.";
      announce(sentence);
      onClose();
    } else if (state?.ok === false) {
      if (state.code !== "invalid") {
        // Not a field the user can fix by looking at this form - the job or
        // the document itself vanished under the user, an unusual
        // concurrent-edit case rather than something a person typed wrong.
        toast.error(`Could not save the document. ${messageFor(state.code)}`);
      }
      // Chromium disabled-focus-loss fix, same as every other form here:
      // Save is disabled only while pending, never removed, so it stays
      // reachable to refocus on every failure, field-level or not.
      submitRef.current?.focus();
    }
  }, [state, announce, onClose]);

  const fieldError = state?.ok === false ? state.fieldErrors?.bodyMd : undefined;

  return (
    <form
      onSubmit={(event) => submitViaTransition(event, formAction)}
      // overflow-x-auto: this form sits directly in the page (no dialog
      // around it), so nothing else stops an unbroken value in the Markdown
      // field below from painting past this form's own width and pushing
      // the page itself into horizontal scroll. This scrolls the form
      // sideways instead, the same way the paste dialog's fields area
      // already scrolls when its content runs long.
      className="flex flex-col gap-3 overflow-x-auto"
    >
      <ModeTabs
        modes={[
          { value: "write", label: "Write" },
          { value: "preview", label: "Preview" },
        ]}
        value={mode}
        onValueChange={(value) => setMode(value as "write" | "preview")}
        label="Editor view"
      />

      {mode === "write" ? (
        <FieldRow label="Markdown" hint={fieldError}>
          {(id, describedBy) => (
            <Textarea
              id={id}
              ref={textareaRef}
              name="bodyMd"
              rows={16}
              // Same risk as the paste dialog's Markdown field: field-sizing
              // content sizes this textarea to fit its value, and with no
              // spaces to wrap on, that can be wider than its row. min-w-0
              // lets it shrink back down to the row instead of forcing the
              // row wider. On its own this was not enough to keep the page
              // from scrolling too - see overflow-x-auto on the form above.
              className="min-w-0 font-mono"
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              aria-describedby={describedBy}
              aria-invalid={Boolean(fieldError)}
            />
          )}
        </FieldRow>
      ) : (
        <>
          {/* The textarea that normally carries bodyMd is unmounted in this
              mode, so this hidden field stands in for it - otherwise Save
              would submit no bodyMd at all even though the draft holds real
              text. */}
          <input type="hidden" name="bodyMd" value={draft} />
          <Markdown source={draft} headingBase={3} />
        </>
      )}

      {isSent ? (
        <p className="text-sm text-muted-foreground">
          {`Version ${version} was sent. Saving creates version ${version + 1}.`}
        </p>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <Button ref={submitRef} type="submit" disabled={pending}>
          Save
        </Button>
        <Button type="button" variant="outline" onClick={() => onClose()}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
