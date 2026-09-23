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
import { AddJobDialog } from "@/components/board/add-job-dialog";
import { moveAction, closeAction } from "@/app/(app)/board/actions";
import { applyMove, removeCard } from "@/lib/board/optimistic";
import { actionFailureMessage } from "@/lib/board/messages";
import { columnTitle } from "@/lib/pipeline/labels";
import { focusCardLink, focusColumnCardOrRegion } from "@/lib/dom/board-focus";
import { correctFocusOnceLost } from "@/lib/dom/focus";
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
// names raw ids rather than the job/column, and duplicates the one intended
// announcement per move, so it is silenced here in favor of the single
// message runMove/runClose already produce. The default
// screenReaderInstructions text ("press the space bar... use the arrow
// keys...") is also wrong for this board: dnd-kit's own keyboard sensor is
// never registered below (number keys and the Move menu are this board's
// keyboard path instead), so that instruction describes a gesture this
// board does not support.
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

export function Board({
  cards,
  nowIso,
  companyNames,
}: {
  cards: BoardCard[];
  nowIso: string;
  companyNames: string[];
}) {
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
  const [addOpen, setAddOpen] = React.useState(false);
  const isDragging = activeId !== null;

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 5 } }),
  );

  function runMove(cardId: string, target: MoveTarget) {
    const card = optimisticCards.find((c) => c.id === cardId);
    if (!card) return;
    // A move to the card's own column is a silent no-op, full stop - no
    // optimistic dispatch, no request, no toast - no matter which of the
    // three triggers (a drop, a number key, the "Move to" menu) asks for it.
    // Living here rather than at each call site is what makes all three
    // behave identically instead of only the one that remembers to check.
    // The menu also renders this same column `disabled` so the no-op is
    // visible, not just silent.
    if ("kind" in target && target.kind === card.stage.kind) return;
    React.startTransition(async () => {
      if ("kind" in target) dispatchOptimistic({ type: "move", id: cardId, toKind: target.kind });
      try {
        const result = await moveAction(cardId, target);
        if (!result.ok) {
          toast.error(actionFailureMessage("move", card, result.code));
          return;
        }
        announce(`Moved ${card.roleTitle} at ${card.companyName} to ${columnTitle(result.data.to.kind)}.`);
        // The moved card's old title link (or its Move menu trigger, itself
        // inside the same card) unmounted the instant the optimistic dispatch
        // above swapped it into its new column. correctFocusOnceLost, not a
        // one-time focusWasLost() check: when the move was triggered through
        // the "Move to" menu, that menu's own popup is still mid closing
        // animation right here, holding focus on its own (about to be
        // removed) trigger - a check made now would see focus as not lost
        // yet and miss the loss that happens once that animation actually
        // finishes.
        correctFocusOnceLost(() => focusCardLink(cardId));
      } catch (error) {
        // moveAction itself can reject before ever returning a Result - for
        // example requireUser()'s own session lookup throws when the
        // database is unreachable, verified by manually stopping the
        // database mid-move. The optimistic card already reverts on its own
        // once this transition ends (tested the same way); without this
        // catch, that revert would happen silently with no toast at all,
        // which is a worse failure than the one this file's Result-based
        // handling above already covers. Logged before the toast, matching
        // app/(auth)/setup/actions.ts's precedent: there is no telemetry
        // elsewhere in this tree, so this is currently the only diagnostic
        // trail for a genuine bug.
        console.error("move failed", error);
        toast.error(actionFailureMessage("move", card, "unexpected"));
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
          toast.error(actionFailureMessage("close", card, result.code));
          return;
        }
        announce(`Closed ${card.roleTitle} at ${card.companyName}.`);
        // The Close dialog is still mid closing animation right here,
        // holding focus on its own "Close job" button - same reasoning as
        // runMove's identical correctFocusOnceLost above, confirmed
        // empirically against this exact dialog: a one-time focusWasLost()
        // check made now sees focus as not lost yet, and the dialog's own
        // focus-restoration (queued behind that animation) then fails to
        // find its original target - the closed card's title link, long
        // gone - and falls back to <body> once the animation actually
        // finishes, uncaught by a check that already ran. Reads the
        // column's current contents live, not a list captured before this
        // await, for the same reason focusColumnCardOrRegion's own comment
        // gives: the board is shared with whatever else is running
        // concurrently.
        correctFocusOnceLost(() => focusColumnCardOrRegion(card.stage.kind));
      } catch (error) {
        // See runMove's matching catch: closeAction can also reject before
        // returning a Result.
        console.error("close failed", error);
        toast.error(actionFailureMessage("close", card, "unexpected"));
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
    // A drop on the card's own column is a no-op: runMove's own guard
    // handles that (see its comment) so it does not need repeating here.
    runMove(cardId, { kind: over.id as StageKind });
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
  const isEmpty = cards.length === 0;

  // AddJobDialog is written exactly once below, as a stable sibling outside
  // the isEmpty/non-empty branches, and NOT once per branch. A card being
  // added is exactly the moment `cards.length` flips from 0 to 1, which
  // flips `isEmpty` too: writing <AddJobDialog> inside each branch's own
  // JSX (as two separate call sites, one under a guard clause's early
  // `return`) would put it at two different positions in the tree, so
  // React would unmount the instance handling the in-flight submission and
  // mount a brand new one right as the server action resolves - the new
  // instance's own useActionState starts back at `undefined`, so it never
  // sees the `{ ok: true }` that just came back, and neither the
  // close-the-dialog nor the announce() effect ever runs. Confirmed
  // empirically (scratch Playwright script): with two call sites, a valid
  // submit against a zero-job board leaves the dialog open and silent even
  // though the card is created correctly. One call site at a fixed
  // position keeps the same component instance mounted across that
  // transition, so its state survives.
  return (
    <>
      {isEmpty ? (
        <div className="hidden md:flex">
          <EmptyState
            size="page"
            title="No jobs yet"
            description="Add the first job you are tracking."
            action={<Button onClick={() => setAddOpen(true)}>Add job</Button>}
            className="w-full"
          />
        </div>
      ) : (
        <div className="hidden md:flex md:flex-col md:gap-4">
          <div className="flex items-center justify-end">
            <Button onClick={() => setAddOpen(true)}>Add job</Button>
          </div>
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
              {activeCard ? (
                <JobCard card={activeCard} now={now} onMove={() => {}} onRequestClose={() => {}} overlay />
              ) : null}
            </DragOverlay>
          </DndContext>
          <CloseDialog
            open={pendingCloseId !== null}
            onOpenChange={(open) => {
              if (!open) setPendingCloseId(null);
            }}
            job={
              pendingCloseCard ? { roleTitle: pendingCloseCard.roleTitle, companyName: pendingCloseCard.companyName } : null
            }
            onConfirm={handleConfirmClose}
          />
        </div>
      )}
      <AddJobDialog open={addOpen} onOpenChange={setAddOpen} companyNames={companyNames} />
    </>
  );
}

/**
 * Only rendered while a card is being dragged (Board's `isDragging`), so a
 * pointer/touch drag is the one way to reach it; the keyboard path and the
 * "Move to" menu close a job through "Close job" instead.
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
