"use client";

import * as React from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/super-ai/empty-state";
import { LocalTime } from "@/components/local-time";
import { useAnnounce } from "@/components/live-announcer";
import { reopenAction } from "@/app/(app)/board/actions";
import { CLOSED_REASON_LABELS } from "@/lib/pipeline/labels";
import { messageFor } from "@/lib/pipeline/messages";
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
          toast.error(`Could not move ${card.roleTitle} at ${card.companyName}. ${messageFor(result.code)}`);
          return;
        }
        announce(`Reopened ${card.roleTitle} at ${card.companyName}.`);
      } catch {
        toast.error(`Could not move ${card.roleTitle} at ${card.companyName}. ${messageFor("unexpected")}`);
      }
    });
  }

  return (
    <li className="flex items-center justify-between gap-3 rounded-lg border bg-card p-3">
      <div className="min-w-0">
        <p className="truncate font-medium">
          {card.roleTitle} at {card.companyName}
        </p>
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
