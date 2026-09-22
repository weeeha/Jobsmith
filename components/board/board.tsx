"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  useDroppable,
  type Announcements,
  type DragEndEvent,
  type ScreenReaderInstructions,
} from "@dnd-kit/core";

import { Button } from "@/components/ui/button";
import { ModeTabs } from "@/components/super-ai/mode-tabs";
import { EmptyState } from "@/components/super-ai/empty-state";
import { useAnnounce } from "@/components/live-announcer";
import { BoardColumn } from "@/components/board/board-column";
import { JobCard } from "@/components/board/job-card";
import { CloseDialog } from "@/components/board/close-dialog";
import { moveAction, closeAction } from "@/app/(app)/board/actions";
import { applyMove, removeCard } from "@/lib/board/optimistic";
import { columnTitle } from "@/lib/pipeline/labels";
import { messageFor } from "@/lib/pipeline/messages";
import { STAGE_KINDS, type StageKind } from "@/lib/pipeline/kinds";
import { cn } from "@/lib/utils";
import type { BoardCard } from "@/lib/db/scoped";
import type { MoveTarget } from "@/lib/pipeline/rules";
import type { ClosedReason } from "@/lib/pipeline/values";

const CLOSED_DROPPABLE_ID = "closed";

/**
 * Board's own optimistic move/close action, dispatched as `{ type: "move" |
 * "remove" }`. `useOptimistic`'s reducer needs one action type covering
 * both, since it owns a single overlay over `cards`.
 */
type OptimisticAction = { type: "move"; id: string; toKind: StageKind } | { type: "remove"; id: string };

// dnd-kit's own DndContext renders a second, separate aria-live="assertive"
// region and announces every drag through it by default (verified by
// inspecting the live DOM during manual testing: a plain-mouse drag
// produced "Draggable item <uuid> was dropped over droppable area
// <stage-kind-slug>" alongside this file's own, human-readable "Moved
// <role> at <company> to <column>." from useAnnounce). That default text
// names raw ids rather than the job/column, and duplicates D6's one
// intended announcement per move, so it is silenced here in favor of the
// single message runMove/runClose already produce. The default
// screenReaderInstructions text ("press the space bar... use the arrow
// keys...") is also wrong for this board: dnd-kit's own keyboard sensor is
// never registered below (number keys and the Move menu are this board's
// keyboard path instead, per D8), so that instruction describes a gesture
// this board does not support.
const silentAnnouncements: Announcements = {
  onDragStart: () => undefined,
  onDragOver: () => undefined,
  onDragEnd: () => undefined,
  onDragCancel: () => undefined,
};
const screenReaderInstructions: ScreenReaderInstructions = {
  draggable:
    "To move this job, open its Move menu, or focus its title and press 1 through 7 to change its column, or C to close it. Dragging with a pointer also works.",
};

export function BoardViewSwitch({ view }: { view: "active" | "closed" }) {
  const router = useRouter();

  return (
    <ModeTabs
      label="Board view"
      modes={[
        { value: "active", label: "Active" },
        { value: "closed", label: "Closed" },
      ]}
      value={view}
      onValueChange={(value) => router.push(value === "closed" ? "/board?view=closed" : "/board")}
    />
  );
}

export function Board({ cards, nowIso }: { cards: BoardCard[]; nowIso: string }) {
  // A prop, not a fresh `new Date()` in the client, so the server-rendered
  // HTML and the first client render agree (the same reasoning LocalTime
  // uses).
  const now = new Date(nowIso);
  const announce = useAnnounce();

  const [optimisticCards, dispatchOptimistic] = React.useOptimistic(
    cards,
    (state: BoardCard[], action: OptimisticAction) =>
      action.type === "move" ? applyMove(state, { id: action.id, toKind: action.toKind }) : removeCard(state, action.id),
  );
  const [activeId, setActiveId] = React.useState<string | null>(null);
  const [pendingCloseId, setPendingCloseId] = React.useState<string | null>(null);
  const isDragging = activeId !== null;

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 5 } }),
  );

  function runMove(cardId: string, target: MoveTarget) {
    const card = optimisticCards.find((c) => c.id === cardId);
    if (!card) return;
    React.startTransition(async () => {
      if ("kind" in target) dispatchOptimistic({ type: "move", id: cardId, toKind: target.kind });
      try {
        const result = await moveAction(cardId, target);
        if (!result.ok) {
          toast.error(`Could not move ${card.roleTitle} at ${card.companyName}. ${messageFor(result.code)}`);
          return;
        }
        announce(`Moved ${card.roleTitle} at ${card.companyName} to ${columnTitle(result.data.to.kind)}.`);
      } catch {
        // moveAction itself can reject before ever returning a Result - for
        // example requireUser()'s own session lookup throws when the
        // database is unreachable, verified by manually stopping the
        // database mid-move. The optimistic card already reverts on its own
        // once this transition ends (D6, tested the same way); without this
        // catch, that revert would happen silently with no toast at all,
        // which is a worse failure than the one this file's Result-based
        // handling above already covers.
        toast.error(`Could not move ${card.roleTitle} at ${card.companyName}. ${messageFor("unexpected")}`);
      }
    });
  }

  function runClose(cardId: string, reason: ClosedReason) {
    const card = optimisticCards.find((c) => c.id === cardId);
    if (!card) return;
    React.startTransition(async () => {
      dispatchOptimistic({ type: "remove", id: cardId });
      try {
        const result = await closeAction(cardId, reason);
        if (!result.ok) {
          toast.error(`Could not move ${card.roleTitle} at ${card.companyName}. ${messageFor(result.code)}`);
          return;
        }
        announce(`Closed ${card.roleTitle} at ${card.companyName}.`);
      } catch {
        // See runMove's matching catch: closeAction can also reject before
        // returning a Result.
        toast.error(`Could not move ${card.roleTitle} at ${card.companyName}. ${messageFor("unexpected")}`);
      }
    });
  }

  function handleDragEnd(event: DragEndEvent) {
    setActiveId(null);
    const { active, over } = event;
    if (!over) return;
    const cardId = String(active.id);
    if (over.id === CLOSED_DROPPABLE_ID) {
      setPendingCloseId(cardId);
      return;
    }
    const toKind = over.id as StageKind;
    const card = optimisticCards.find((c) => c.id === cardId);
    if (!card || card.stage.kind === toKind) return; // dropping on its own column does nothing
    runMove(cardId, { kind: toKind });
  }

  function handleConfirmClose(reason: ClosedReason) {
    if (pendingCloseId) runClose(pendingCloseId, reason);
    setPendingCloseId(null);
  }

  const activeCard = activeId ? (optimisticCards.find((c) => c.id === activeId) ?? null) : null;
  const pendingCloseCard = pendingCloseId ? (optimisticCards.find((c) => c.id === pendingCloseId) ?? null) : null;

  // `cards.length`, the server-confirmed prop, not the optimistic view: a
  // job being closed optimistically should not flash the whole board to
  // its empty state before the server round trip confirms it.
  if (cards.length === 0) {
    return (
      <div className="hidden md:flex">
        <EmptyState
          size="page"
          title="No jobs yet"
          description="Add the first job you are tracking."
          action={<Button>Add job</Button>}
          className="w-full"
        />
      </div>
    );
  }

  return (
    <div className="hidden md:flex md:flex-col md:gap-4">
      <DndContext
        sensors={sensors}
        accessibility={{ announcements: silentAnnouncements, screenReaderInstructions }}
        onDragStart={(event) => setActiveId(String(event.active.id))}
        onDragEnd={handleDragEnd}
        onDragCancel={() => setActiveId(null)}
      >
        <section
          tabIndex={0}
          aria-label="Board columns"
          className="flex gap-4 overflow-x-auto focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {STAGE_KINDS.map((stage) => {
            const columnCards = optimisticCards.filter((card) => card.stage.kind === stage.kind);
            return (
              <BoardColumn key={stage.kind} kind={stage.kind} cards={columnCards}>
                {columnCards.map((card) => (
                  <JobCard
                    key={card.id}
                    card={card}
                    now={now}
                    onMove={(target) => runMove(card.id, target)}
                    onRequestClose={() => setPendingCloseId(card.id)}
                  />
                ))}
              </BoardColumn>
            );
          })}
        </section>
        {isDragging && <ClosedDropZone />}
        <DragOverlay>
          {activeCard ? <JobCard card={activeCard} now={now} onMove={() => {}} onRequestClose={() => {}} overlay /> : null}
        </DragOverlay>
      </DndContext>
      <CloseDialog
        open={pendingCloseId !== null}
        onOpenChange={(open) => {
          if (!open) setPendingCloseId(null);
        }}
        job={pendingCloseCard ? { roleTitle: pendingCloseCard.roleTitle, companyName: pendingCloseCard.companyName } : null}
        onConfirm={handleConfirmClose}
      />
    </div>
  );
}

/**
 * Only rendered while a card is being dragged (Board's `isDragging`), so a
 * pointer/touch drag is the one way to reach it; the keyboard path and the
 * "Move to" menu close a job through "Close job" instead (D8).
 */
function ClosedDropZone() {
  const { setNodeRef, isOver } = useDroppable({ id: CLOSED_DROPPABLE_ID });

  return (
    <div
      ref={setNodeRef}
      className={cn(
        "flex h-16 shrink-0 items-center justify-center rounded-lg border border-dashed text-sm text-muted-foreground",
        isOver && "border-destructive bg-destructive/10 text-destructive",
      )}
    >
      Drop here to close
    </div>
  );
}
