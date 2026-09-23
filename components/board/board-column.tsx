"use client";

import type { ReactNode } from "react";
import { useDroppable } from "@dnd-kit/core";

import { cn } from "@/lib/utils";
import { KanbanColumn } from "@/components/super-ai/kanban-column";
import { columnTitle } from "@/lib/pipeline/labels";
import type { StageKind } from "@/lib/pipeline/kinds";
import type { BoardCard } from "@/lib/db/scoped";

interface BoardColumnProps {
  kind: StageKind;
  cards: BoardCard[];
  children: ReactNode;
}

/**
 * The droppable wrapper for one column, plus its own empty-rail mode.
 *
 * `kind` doubles as the droppable's id, which is what lets board.tsx's
 * onDragEnd read `over.id` straight back as a StageKind. The wrapper `div`,
 * not the `<section>` inside it, is the droppable and the thing that
 * widens: it stays mounted across a card count going from zero to one and
 * back, so a card being added or removed never remounts the drop target
 * mid-drag.
 */
export function BoardColumn({ kind, cards, children }: BoardColumnProps) {
  const { setNodeRef, isOver } = useDroppable({ id: kind });
  const title = columnTitle(kind);
  const count = cards.length;
  const rail = count === 0 && !isOver;

  return (
    <div
      ref={setNodeRef}
      className={cn(
        "h-full shrink-0 overflow-hidden transition-all duration-base ease-standard",
        rail ? "w-12" : "w-64",
      )}
    >
      {count > 0 ? (
        <KanbanColumn title={title} count={count} className="h-full w-full">
          {children}
        </KanbanColumn>
      ) : (
        <section
          aria-label={`${title}, no jobs`}
          // -1: not part of the normal Tab order, but a valid target for
          // board.tsx to send focus to once closing a job leaves this column
          // with nothing left in it to focus instead (lib/dom/board-focus.ts's
          // focusColumnRegion).
          tabIndex={-1}
          className="flex h-full flex-col items-center gap-2 rounded-lg border bg-muted/40 px-1 py-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <h2 className="truncate text-sm font-medium">{title}</h2>
          <span className="text-xs tabular-nums opacity-70">0</span>
        </section>
      )}
    </div>
  );
}
