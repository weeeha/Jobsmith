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
  const [mode, setMode] = React.useState<"write" | "preview">("write");
  const [draft, setDraft] = React.useState(props.bodyMd);
  const action = saveDocumentEditAction.bind(null, props.opportunityId, props.documentKey);
  const [state, formAction, pending] = React.useActionState<EditFormState, FormData>(action, undefined);
  const announce = useAnnounce();
  const editRef = React.useRef<HTMLButtonElement>(null);
  const submitRef = React.useRef<HTMLButtonElement>(null);
  const textareaRef = React.useRef<HTMLTextAreaElement>(null);

  // "Edit" unmounts itself the instant it is clicked (the branch below
  // switches to the form), so a naive "focus the thing that was just
  // clicked" cannot work for either direction - the same idiom
  // next-action-bar.tsx uses for its own editing toggle, where opening
  // moves focus into the form's first field and closing moves it back.
  const wasEditing = React.useRef(false);
  React.useEffect(() => {
    if (editing) {
      wasEditing.current = true;
      textareaRef.current?.focus();
      return;
    }
    if (wasEditing.current) {
      wasEditing.current = false;
      editRef.current?.focus();
    }
  }, [editing]);

  React.useEffect(() => {
    if (state?.ok) {
      const sentence =
        state.data.status === "edited"
          ? `Saved ${state.data.title}.`
          : state.data.status === "versioned"
            ? `Saved ${state.data.title} as version ${state.data.version}.`
            : "No changes to save.";
      announce(sentence);
      // Closing the editor here is a reaction to the save request settling,
      // not state derivable from a prop during render - and unlike
      // next-action-bar.tsx's own editing toggle, there is no parent
      // component here to own an "onSaved" callback instead: this component
      // owns both the toggle and the save request that resolves it.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setEditing(false);
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
  }, [state, announce]);

  const fieldError = state?.ok === false ? state.fieldErrors?.bodyMd : undefined;

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
              setDraft(props.bodyMd);
              // Always reopens on Write, never wherever a previous session
              // left it - Preview shows the live draft, and the first thing
              // a fresh session needs is somewhere to type it.
              setMode("write");
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
    <form onSubmit={(event) => submitViaTransition(event, formAction)} className="flex flex-col gap-3">
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
              className="font-mono"
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

      {props.isSent ? (
        <p className="text-sm text-muted-foreground">
          {`Version ${props.version} was sent. Saving creates version ${props.version + 1}.`}
        </p>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <Button ref={submitRef} type="submit" disabled={pending}>
          Save
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={() => {
            setDraft(props.bodyMd);
            setMode("write");
            setEditing(false);
          }}
        >
          Cancel
        </Button>
      </div>
    </form>
  );
}
