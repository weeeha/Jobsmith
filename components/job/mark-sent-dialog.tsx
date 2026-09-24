"use client";

import * as React from "react";
import { toast } from "sonner";

import { markDocumentSentAction } from "@/app/(app)/jobs/[slug]/document-actions";
import { useAnnounce } from "@/components/live-announcer";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { correctFocusOnceLost } from "@/lib/dom/focus";
import { messageFor } from "@/lib/pipeline/messages";

export function MarkSentDialogTrigger(props: {
  opportunityId: string;
  documentKey: string;
  version: number;
  title: string;
}): React.ReactElement {
  const [open, setOpen] = React.useState(false);
  const triggerRef = React.useRef<HTMLButtonElement>(null);
  const [, startTransition] = React.useTransition();
  const announce = useAnnounce();

  // Edit stays available even for a sent latest version (editing it starts
  // a new version rather than being blocked), so it is the first fallback;
  // the second fallback exists for the rarer case of marking an older,
  // previously unsent version as sent, where Edit itself is hidden.
  function fallbackFocusTarget(): HTMLElement | null {
    return (
      document.querySelector<HTMLElement>("[data-document-edit]") ??
      document.querySelector<HTMLElement>("[data-document-title]")
    );
  }

  function handleConfirm() {
    startTransition(async () => {
      try {
        const result = await markDocumentSentAction(props.opportunityId, props.documentKey, props.version);
        if (!result.ok) {
          toast.error(`Could not mark ${props.title} as sent. ${messageFor(result.code)}`);
          return;
        }
        setOpen(false);
        announce(`Marked ${props.title} as sent.`);
        // The dialog is still mid closing animation right here, and the
        // trigger it will try to restore focus to - this row's own "Mark as
        // sent" button - is gone the instant the revalidated page no longer
        // shows it (a sent version is no longer unsent, so the button that
        // only shows for an unsent version disappears), the same reasoning
        // board.tsx's runClose gives for using correctFocusOnceLost instead
        // of a one-time focusWasLost() check: that covers the case where
        // this final poll below is not enough on its own, confirmed
        // empirically against a real browser - Base UI's own close-focus
        // restoration runs fast enough that it lands on some other,
        // already-focusable element (not <body>) before that poll's first
        // tick, which focusWasLost() has no reason to treat as lost. The
        // Popup's own finalFocus prop below is the direct fix for that: it
        // replaces Base UI's default restore target with this fallback
        // outright, rather than reacting after the fact.
        correctFocusOnceLost(() => {
          fallbackFocusTarget()?.focus();
        });
      } catch (error) {
        console.error("mark as sent failed", error);
        toast.error(`Could not mark ${props.title} as sent. ${messageFor("unexpected")}`);
      }
    });
  }

  return (
    <>
      <Button
        ref={triggerRef}
        aria-label={`Mark version ${props.version} of ${props.title} as sent`}
        onClick={() => setOpen(true)}
      >
        Mark as sent
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        {/* finalFocus overrides Base UI's own default close-focus target
            (the trigger, or whatever it falls back to once the trigger is
            gone) with the same fallback the confirm handler polls for -
            this is what actually lands focus on Edit once the trigger
            unmounts, not merely a backstop for it. */}
        <DialogContent finalFocus={fallbackFocusTarget}>
          <DialogHeader>
            <DialogTitle>Mark as sent</DialogTitle>
          </DialogHeader>
          <p className="break-words text-sm text-muted-foreground">
            {`Version ${props.version} of ${props.title} becomes read-only. Later edits start a new version.`}
          </p>
          <DialogFooter>
            <Button onClick={handleConfirm}>Mark as sent</Button>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
