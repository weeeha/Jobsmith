"use client";

import * as React from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { CloseDialog } from "@/components/board/close-dialog";
import { EditDetailsDialog } from "@/components/job/edit-details-dialog";
import { ReviewNotice } from "@/components/job/review-notice";
import { LocalTime } from "@/components/local-time";
import { useAnnounce } from "@/components/live-announcer";
import { closeAction, reopenAction } from "@/app/(app)/board/actions";
import { actionFailureMessage } from "@/lib/board/messages";
import { focusWasLost, correctFocusOnceLost } from "@/lib/dom/focus";
import { CLOSED_REASON_LABELS } from "@/lib/pipeline/labels";
import type { OpportunityStatus, ClosedReason, WorkMode } from "@/lib/pipeline/values";
import { MoreVertical } from "lucide-react";

// JobHeaderProps names only the fields JobHeader renders itself (roleTitle,
// sourceUrl, location, status, closedReason, closedAt). JobHeader also owns
// EditDetailsDialog locally (its "Edit details" menu item opens it), and
// that dialog's own props need the rest of the opportunity's editable
// columns, so this type is the union of both: exactly what page.tsx's
// `view.opportunity` (an `OpportunityRow`) already has, nothing invented.
interface JobHeaderProps {
  opportunity: {
    id: string;
    roleTitle: string;
    sourceUrl: string | null;
    location: string | null;
    status: OpportunityStatus;
    closedReason: ClosedReason | null;
    closedAt: Date | null;
    workMode: WorkMode | null;
    compMin: number | null;
    compMax: number | null;
    compCurrency: string | null;
    compNote: string | null;
    myAsk: string | null;
  };
  companyName: string;
  needsReview: boolean;
}

export function JobHeader({ opportunity, companyName, needsReview }: JobHeaderProps) {
  const [editOpen, setEditOpen] = React.useState(false);
  const [closeOpen, setCloseOpen] = React.useState(false);
  const [isReopenPending, startReopenTransition] = React.useTransition();
  const announce = useAnnounce();
  const jobActionsRef = React.useRef<HTMLButtonElement>(null);
  const prevStatusRef = React.useRef(opportunity.status);
  const prevNeedsReviewRef = React.useRef(needsReview);

  // A successful Reopen removes both of its own triggers from the DOM: the
  // closed banner (and its "Reopen job" button) disappears, and the menu's
  // "Reopen job" item is replaced by "Close job" - once `opportunity.status`
  // actually flips to "active" via the revalidated page, whichever one was
  // focused is gone. This has to watch the committed prop, not check
  // document.activeElement synchronously right after reopenAction's own
  // promise resolves: that promise settles before Next.js has re-fetched
  // and applied the revalidated page, so an immediate check almost always
  // still finds the old, still-focused button (confirmed empirically while
  // testing the same class of bug in edit-stages-dialog.tsx). Recovers onto
  // "Job actions", the one control in this header that exists regardless
  // of status.
  React.useEffect(() => {
    const justReopened = prevStatusRef.current === "closed" && opportunity.status === "active";
    prevStatusRef.current = opportunity.status;
    if (justReopened && focusWasLost()) {
      jobActionsRef.current?.focus();
    }
  }, [opportunity.status]);

  // Mark as checked (review-notice.tsx) and a saved Edit details change
  // (updateOpportunityDetails clears needs_review on every successful
  // save, lib/pipeline/details.ts) both remove this notice's own buttons -
  // the Edit details path from inside a closing EditDetailsDialog, whose
  // own exit animation queues Base UI's usual focus restoration behind it.
  // correctFocusOnceLost (not a one-time focusWasLost() check, unlike the
  // Reopen effect above) is what that race needs: the same one
  // lib/dom/focus.ts's own doc comment describes for CloseDialog,
  // confirmed there empirically. Recovers onto "Job actions", the one
  // control in this header that exists regardless of needsReview.
  React.useEffect(() => {
    const justResolved = prevNeedsReviewRef.current && !needsReview;
    prevNeedsReviewRef.current = needsReview;
    if (justResolved) {
      correctFocusOnceLost(() => jobActionsRef.current?.focus());
    }
  }, [needsReview]);

  function handleConfirmClose(reason: ClosedReason) {
    React.startTransition(async () => {
      const subject = { roleTitle: opportunity.roleTitle, companyName };
      try {
        const result = await closeAction(opportunity.id, reason);
        if (!result.ok) {
          toast.error(actionFailureMessage("close", subject, result.code));
          return;
        }
        announce(`Closed ${opportunity.roleTitle} at ${companyName}.`);
        setCloseOpen(false);
      } catch (error) {
        // closeAction can reject before ever returning a Result - for
        // example requireUser()'s own session lookup throws when the
        // database is unreachable (board.tsx's runMove/runClose document
        // the same case for moveAction/closeAction). Without this catch,
        // that would fail silently with no toast at all.
        console.error("close failed", error);
        toast.error(actionFailureMessage("close", subject, "unexpected"));
      }
    });
  }

  function handleReopen() {
    startReopenTransition(async () => {
      const subject = { roleTitle: opportunity.roleTitle, companyName };
      try {
        const result = await reopenAction(opportunity.id);
        if (!result.ok) {
          toast.error(actionFailureMessage("reopen", subject, result.code));
          return;
        }
        announce(`Reopened ${opportunity.roleTitle} at ${companyName}.`);
      } catch (error) {
        // See handleConfirmClose: reopenAction can also reject before
        // returning a Result.
        console.error("reopen failed", error);
        toast.error(actionFailureMessage("reopen", subject, "unexpected"));
      }
    });
  }

  return (
    <header className="flex flex-col gap-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h1 className="text-xl font-semibold text-foreground">{opportunity.roleTitle}</h1>
          <p className="text-muted-foreground">
            {companyName}
            {opportunity.location ? <> · {opportunity.location}</> : null}
          </p>
          {opportunity.sourceUrl ? (
            <a
              href={opportunity.sourceUrl}
              target="_blank"
              rel="noreferrer"
              className="text-sm text-primary underline-offset-4 hover:underline"
            >
              Original posting
            </a>
          ) : null}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger render={<Button ref={jobActionsRef} variant="ghost" size="icon" aria-label="Job actions" />}>
              <MoreVertical aria-hidden />
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuItem onClick={() => setEditOpen(true)}>Edit details</DropdownMenuItem>
              <DropdownMenuSeparator />
              {opportunity.status === "active" ? (
                <DropdownMenuItem onClick={() => setCloseOpen(true)}>Close job</DropdownMenuItem>
              ) : (
                <DropdownMenuItem disabled={isReopenPending} onClick={handleReopen}>
                  Reopen job
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {needsReview ? (
        <ReviewNotice opportunityId={opportunity.id} onEditDetails={() => setEditOpen(true)} />
      ) : null}

      {opportunity.status === "closed" && opportunity.closedReason && opportunity.closedAt ? (
        <div role="status" className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-muted p-3 text-sm">
          <p className="text-foreground">
            Closed: {CLOSED_REASON_LABELS[opportunity.closedReason]} on <LocalTime value={opportunity.closedAt} mode="date" />.
          </p>
          <Button variant="outline" size="sm" disabled={isReopenPending} onClick={handleReopen}>
            Reopen job
          </Button>
        </div>
      ) : null}

      <EditDetailsDialog open={editOpen} onOpenChange={setEditOpen} opportunity={opportunity} />
      <CloseDialog
        open={closeOpen}
        onOpenChange={setCloseOpen}
        job={{ roleTitle: opportunity.roleTitle, companyName }}
        onConfirm={handleConfirmClose}
      />
    </header>
  );
}
