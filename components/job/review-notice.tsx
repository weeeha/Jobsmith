"use client";

import * as React from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { useAnnounce } from "@/components/live-announcer";
import { markReviewedAction } from "@/app/(app)/jobs/[slug]/actions";
import { messageFor } from "@/lib/pipeline/messages";
import { MARKED_REVIEWED_MESSAGE, REVIEW_NOTICE_TEXT } from "@/lib/intake/messages";

export function ReviewNotice({
  opportunityId,
  onEditDetails,
}: {
  opportunityId: string;
  onEditDetails: () => void;
}) {
  const announce = useAnnounce();
  const [pending, startTransition] = React.useTransition();

  function handleMarkAsChecked() {
    startTransition(async () => {
      try {
        const result = await markReviewedAction(opportunityId);
        if (!result.ok) {
          toast.error(`Could not mark the details as checked. ${messageFor(result.code)}`);
          return;
        }
        announce(MARKED_REVIEWED_MESSAGE);
      } catch (error) {
        // markReviewedAction can reject before ever returning a Result -
        // requireUser()'s own session lookup throws when the database is
        // unreachable, the same case job-header.tsx's handleConfirmClose
        // and handleReopen already document for their own actions. Without
        // this catch, that would fail silently with no toast at all.
        console.error("mark reviewed failed", error);
        toast.error(`Could not mark the details as checked. ${messageFor("unexpected")}`);
      }
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-muted p-3 text-sm">
      <p className="text-foreground">
        {REVIEW_NOTICE_TEXT}
      </p>
      <Button variant="outline" size="sm" onClick={onEditDetails}>
        Edit details
      </Button>
      <Button variant="outline" size="sm" disabled={pending} onClick={handleMarkAsChecked}>
        Mark as checked
      </Button>
    </div>
  );
}
