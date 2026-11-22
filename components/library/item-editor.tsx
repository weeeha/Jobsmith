"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { archiveLibraryItemAction, updateLibraryItemAction } from "@/app/(app)/library/actions";
import { ChipField } from "@/components/chip-field";
import { useAnnounce } from "@/components/live-announcer";
import { Markdown } from "@/components/markdown";
import { FieldRow } from "@/components/super-ai/field-row";
import { ModeTabs } from "@/components/super-ai/mode-tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { submitViaTransition } from "@/lib/forms/submit";
import type { FormStateWith } from "@/lib/forms/state";
import { LIBRARY_COPY } from "@/lib/library/copy";

// Shows the rendered body (made on the server) with an Edit button, as the
// Documents tab does. Editing swaps in the form; the kind is not editable.
export function ItemEditor(props: {
  id: string;
  title: string;
  bodyMd: string;
  tags: string[];
  renderedBody: React.ReactNode;
}): React.ReactElement {
  const [editing, setEditing] = React.useState(false);
  // A new key per edit session, so a failed save's errors do not outlive it.
  const [session, setSession] = React.useState(0);
  const editRef = React.useRef<HTMLButtonElement>(null);
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

  const close = React.useCallback(() => setEditing(false), []);

  if (!editing) {
    return (
      <div className="flex flex-col gap-3">
        {props.renderedBody}
        <div>
          <Button
            ref={editRef}
            variant="outline"
            size="sm"
            aria-label={`${LIBRARY_COPY.edit} ${props.title}`}
            onClick={() => {
              setSession((n) => n + 1);
              setEditing(true);
            }}
          >
            {LIBRARY_COPY.edit}
          </Button>
        </div>
      </div>
    );
  }
  return <EditForm key={session} {...props} onClose={close} />;
}

function EditForm({
  id,
  title,
  bodyMd,
  tags,
  onClose,
}: {
  id: string;
  title: string;
  bodyMd: string;
  tags: string[];
  onClose: () => void;
}): React.ReactElement {
  const router = useRouter();
  const announce = useAnnounce();
  const [mode, setMode] = React.useState<"write" | "preview">("write");
  const [draftTitle, setDraftTitle] = React.useState(title);
  const [draft, setDraft] = React.useState(bodyMd);
  const action = updateLibraryItemAction.bind(null, id);
  const [state, formAction, pending] = React.useActionState<FormStateWith<{ id: string }>, FormData>(action, undefined);
  const submitRef = React.useRef<HTMLButtonElement>(null);
  const titleRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    titleRef.current?.focus();
  }, []);

  React.useEffect(() => {
    if (state?.ok) {
      announce(`Saved ${draftTitle.trim()}.`);
      router.refresh();
      onClose();
    } else if (state?.ok === false) {
      if (state.code !== "invalid") toast.error(`Could not save the item. ${state.message}`);
      // Save is only disabled while pending, so it stays reachable to refocus.
      submitRef.current?.focus();
    }
    // draftTitle is read only for the announcement of this very save.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  const errors = state?.ok === false ? state.fieldErrors : undefined;

  return (
    <form onSubmit={(event) => submitViaTransition(event, formAction)} className="flex flex-col gap-3">
      <FieldRow label={LIBRARY_COPY.fields.title} hint={errors?.title}>
        {(fieldId, describedBy) => (
          <Input
            id={fieldId}
            ref={titleRef}
            name="title"
            value={draftTitle}
            onChange={(event) => setDraftTitle(event.target.value)}
            aria-describedby={describedBy}
            aria-invalid={Boolean(errors?.title)}
          />
        )}
      </FieldRow>

      <ModeTabs
        modes={[
          { value: "write", label: LIBRARY_COPY.write },
          { value: "preview", label: LIBRARY_COPY.preview },
        ]}
        value={mode}
        onValueChange={(value) => setMode(value as "write" | "preview")}
        label="Editor view"
      />
      {mode === "write" ? (
        <FieldRow label={LIBRARY_COPY.fields.body} hint={errors?.bodyMd}>
          {(fieldId, describedBy) => (
            <Textarea
              id={fieldId}
              name="bodyMd"
              rows={12}
              className="min-w-0 font-mono"
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              aria-describedby={describedBy}
              aria-invalid={Boolean(errors?.bodyMd)}
            />
          )}
        </FieldRow>
      ) : (
        <>
          {/* The textarea is unmounted in Preview; this stands in for it so Save still sends the draft. */}
          <input type="hidden" name="bodyMd" value={draft} />
          <Markdown source={draft} headingBase={3} />
        </>
      )}

      <FieldRow label={LIBRARY_COPY.fields.tags} hint={errors?.tags ?? "Up to 20 tags, each up to 80 characters."}>
        {(fieldId, describedBy) => (
          <ChipField id={fieldId} name="tags" defaultValues={tags} aria-describedby={describedBy} invalid={Boolean(errors?.tags)} />
        )}
      </FieldRow>

      <div className="flex flex-wrap items-center gap-2">
        <Button ref={submitRef} type="submit" disabled={pending}>
          {LIBRARY_COPY.save}
        </Button>
        <Button type="button" variant="outline" onClick={() => onClose()}>
          {LIBRARY_COPY.cancel}
        </Button>
      </div>
    </form>
  );
}

export function ArchiveButton({ id, archived }: { id: string; archived: boolean }): React.ReactElement {
  const router = useRouter();
  const announce = useAnnounce();
  const [pending, startTransition] = React.useTransition();

  function toggle() {
    startTransition(async () => {
      try {
        const result = await archiveLibraryItemAction(id, !archived);
        if (!result.ok) {
          toast.error(result.message);
          return;
        }
        announce(result.data.archived ? "Archived." : "Restored.");
        router.refresh();
      } catch {
        toast.error("Could not change the item. Try again.");
      }
    });
  }

  return (
    <Button type="button" variant="outline" size="sm" disabled={pending} onClick={toggle}>
      {archived ? LIBRARY_COPY.unarchive : LIBRARY_COPY.archive}
    </Button>
  );
}
