"use client";

import * as React from "react";
import Link from "next/link";
import { BookmarkPlus } from "lucide-react";
import { toast } from "sonner";

import { saveToLibraryAction } from "@/app/(app)/library/actions";
import { useAnnounce } from "@/components/live-announcer";
import { Button } from "@/components/ui/button";
import { LIBRARY_COPY } from "@/lib/library/copy";

// One question's answer into the library. The name carries the question
// when the list shows several, so a screen reader can tell the buttons apart.
export function SaveToLibraryButton(props: {
  opportunityId: string;
  questionKey: string;
  questionLabel?: string;
  className?: string;
}): React.ReactElement {
  const announce = useAnnounce();
  const [pending, startTransition] = React.useTransition();

  function save() {
    startTransition(async () => {
      try {
        const result = await saveToLibraryAction({ opportunityId: props.opportunityId, questionKey: props.questionKey });
        if (!result.ok) {
          toast.error(result.message);
          return;
        }
        const message = result.data.created ? LIBRARY_COPY.saved : LIBRARY_COPY.alreadySaved;
        announce(message);
        toast.success(
          <span className="flex flex-wrap items-center gap-x-3">
            <span>{message}</span>
            <Link href={`/library/${result.data.id}`} className="underline underline-offset-4">
              {LIBRARY_COPY.open}
            </Link>
          </span>,
        );
      } catch (error) {
        console.error("save to library failed", error);
        toast.error(LIBRARY_COPY.saveFailed);
      }
    });
  }

  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      disabled={pending}
      onClick={save}
      aria-label={props.questionLabel ? `${LIBRARY_COPY.saveButton}: ${props.questionLabel}` : undefined}
      className={props.className}
    >
      <BookmarkPlus aria-hidden="true" />
      {LIBRARY_COPY.saveButton}
    </Button>
  );
}
