"use client";

import type { KeyboardEvent } from "react";
import Link from "next/link";
import { useDraggable } from "@dnd-kit/core";

import { Badge } from "@/components/ui/badge";
import { LocalTime } from "@/components/local-time";
import { MoveMenu } from "@/components/board/move-menu";
import { daysInStage } from "@/lib/board/days";
import { keyToAction } from "@/lib/board/keys";
import { STAGE_KINDS, type StageKind } from "@/lib/pipeline/kinds";
import { cn } from "@/lib/utils";
import type { BoardCard } from "@/lib/db/scoped";
import type { MoveTarget } from "@/lib/pipeline/rules";

interface JobCardProps {
  card: BoardCard;
  now: Date;
  onMove: (target: MoveTarget) => void;
  onRequestClose: () => void;
  overlay?: boolean;
}

function defaultLabelFor(kind: StageKind): string {
  const entry = STAGE_KINDS.find((s) => s.kind === kind);
  if (!entry) throw new Error(`Unknown stage kind: ${kind}`);
  return entry.defaultLabel;
}

function daysLabel(days: number): string {
  if (days === 0) return "Today";
  if (days === 1) return "1 day";
  return `${days} days`;
}

export function JobCard({ card, now, onMove, onRequestClose, overlay }: JobCardProps) {
  const { setNodeRef, listeners, isDragging } = useDraggable({ id: card.id, disabled: overlay });

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    // A key typed inside the open "Move to" menu reaches the DOM through a
    // portal outside this div, but React still bubbles its synthetic
    // keydown event here, so this ignores any event whose real target is
    // not inside this card.
    if (!event.currentTarget.contains(event.target as Node)) return;
    // A modifier held down means the browser or the OS owns this key
    // combination (Cmd+1 switching tabs, for example), not the board.
    if (event.metaKey || event.ctrlKey || event.altKey) return;
    // A held key auto-repeats; only the first press should trigger a move.
    if (event.repeat) return;
    const target = event.target as HTMLElement;
    // Lets a future field inside the card (none exist yet) receive its own
    // keystrokes instead of the board's.
    if (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable) return;
    const action = keyToAction(event.key);
    if (!action) return;
    event.preventDefault();
    if (action.type === "close") onRequestClose();
    else onMove({ kind: action.kind });
  }

  const days = daysInStage(card.stage.enteredAt, now);
  const showStageLabel = card.stage.label !== defaultLabelFor(card.stage.kind);
  const hasChips = card.fitScore !== null || showStageLabel || days !== null;

  return (
    <div
      ref={setNodeRef}
      {...listeners}
      onKeyDown={handleKeyDown}
      className={cn("rounded-lg border bg-card p-3", isDragging && "opacity-50")}
    >
      <div className="flex items-start justify-between gap-2">
        {/* One link, two visible lines: role on top, company below. The
            company span's text starts with the literal word "at" so the
            link's accessible name (the concatenation of both spans' text)
            reads "<role> at <company>" rather than "<role> <company>" -
            adjacent block-level spans already pick up an implicit space in
            that concatenation, so "at" is the only piece missing without
            this. draggable={false} is required: without it, starting a
            drag on the link's own text triggers the browser's native
            link-drag instead of dnd-kit's, which cancels the pointer
            events dnd-kit needs to see the gesture at all.

            Each line truncates with an ellipsis rather than wrapping (see
            board-column.tsx's shrink-0: columns hold a steady width instead
            of compressing, so truncation has a stable line to work from
            rather than clipping arbitrarily). The link's accessible name
            above already carries the untruncated text to assistive
            technology; `title` here additionally surfaces it as the
            browser's native tooltip on mouse hover, so a visually clipped
            title or company name is never only available by opening the
            job. */}
        <Link
          href={`/jobs/${card.slug}`}
          draggable={false}
          data-card-id={card.id}
          title={`${card.roleTitle} at ${card.companyName}`}
          className="min-w-0 flex-1 rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <span className="block truncate font-medium">{card.roleTitle}</span>
          <span className="block truncate text-muted-foreground">at {card.companyName}</span>
        </Link>
        <MoveMenu card={card} onMove={onMove} onRequestClose={onRequestClose} />
      </div>
      {hasChips && (
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          {card.fitScore !== null && <Badge variant="secondary">{card.fitScore}</Badge>}
          {showStageLabel && <Badge variant="outline">{card.stage.label}</Badge>}
          {days !== null && <Badge variant="outline">{daysLabel(days)}</Badge>}
        </div>
      )}
      {card.nextAction !== null && (
        <p className="mt-2 text-xs text-muted-foreground">
          Next: {card.nextAction}
          {card.nextActionAt !== null ? (
            <>
              {" "}
              (<LocalTime value={card.nextActionAt} mode="date" />)
            </>
          ) : null}
        </p>
      )}
    </div>
  );
}
