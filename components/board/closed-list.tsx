"use client";

import * as React from "react";
import Link from "next/link";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/super-ai/empty-state";
import { LocalTime } from "@/components/local-time";
import { useAnnounce } from "@/components/live-announcer";
import { reopenAction } from "@/app/(app)/board/actions";
import { actionFailureMessage } from "@/lib/board/messages";
import { CLOSED_REASON_LABELS } from "@/lib/pipeline/labels";
import type { ClosedCard } from "@/lib/db/scoped";

interface ClosedListProps {
  cards: ClosedCard[];
}

export function ClosedList({ cards }: ClosedListProps) {
  if (cards.length === 0) {
    return <EmptyState title="No closed jobs." />;
  }

  return (
    <ul className="mt-4 flex flex-col gap-2">
      {cards.map((card) => (
        <ClosedListRow key={card.id} card={card} />
      ))}
    </ul>
  );
}

function ClosedListRow({ card }: { card: ClosedCard }) {
  const [isPending, startTransition] = React.useTransition();
  const announce = useAnnounce();

  function handleReopen() {
    startTransition(async () => {
      // See board.tsx's runMove/runClose: reopenAction can also reject
      // before returning a Result (requireUser()'s own session lookup
      // throws when the database is unreachable, confirmed by manually
      // stopping it mid-action), so this needs the same catch to avoid
      // failing silently.
      try {
        const result = await reopenAction(card.id);
        if (!result.ok) {
          toast.error(actionFailureMessage("reopen", card, result.code));
          return;
        }
        announce(`Reopened ${card.roleTitle} at ${card.companyName}.`);
      } catch (error) {
        // Logged before the toast, matching app/(auth)/setup/actions.ts's
        // precedent: there is no telemetry elsewhere in this tree, so this
        // is currently the only diagnostic trail for a genuine bug.
        console.error("reopen failed", error);
        toast.error(actionFailureMessage("reopen", card, "unexpected"));
      }
    });
  }

  return (
    <li className="flex items-center justify-between gap-3 rounded-lg border bg-card p-3">
      <div className="min-w-0">
        {/* A link, not plain text: the row otherwise showed a job's name
            with no way to open it, so reading a stage's stored details
            meant reopening the job first. */}
        <Link
          href={`/jobs/${card.slug}`}
          className="block truncate rounded-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {card.roleTitle} at {card.companyName}
        </Link>
        <p className="text-sm text-muted-foreground">
          {CLOSED_REASON_LABELS[card.closedReason]} · <LocalTime value={card.closedAt} mode="date" />
        </p>
      </div>
      <Button
        variant="outline"
        size="sm"
        disabled={isPending}
        aria-label={`Reopen ${card.roleTitle} at ${card.companyName}`}
        onClick={handleReopen}
      >
        Reopen
      </Button>
    </li>
  );
}
