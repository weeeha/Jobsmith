"use client";

import * as React from "react";
import Link from "next/link";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/super-ai/empty-state";
import { LocalTime } from "@/components/local-time";
import { useAnnounce } from "@/components/live-announcer";
import { MoveSheet } from "@/components/board/move-sheet";
import { CloseDialog } from "@/components/board/close-dialog";
import { AddJobDialog } from "@/components/board/add-job-dialog";
import { moveAction, closeAction } from "@/app/(app)/board/actions";
import { applyMove, removeCard } from "@/lib/board/optimistic";
import { actionFailureMessage } from "@/lib/board/messages";
import { daysInStage } from "@/lib/board/days";
import { columnTitle } from "@/lib/pipeline/labels";
import { focusCardButton, nextFocusCandidate } from "@/lib/dom/board-focus";
import { focusWasLost } from "@/lib/dom/focus";
import { STAGE_KINDS, type StageKind } from "@/lib/pipeline/kinds";
import type { BoardCard } from "@/lib/db/scoped";
import type { MoveTarget } from "@/lib/pipeline/rules";
import type { ClosedReason } from "@/lib/pipeline/values";

/**
 * Board's own optimistic move/close action - see board.tsx's identical type
 * for why one reducer covers both. Duplicated rather than imported: it is
 * private to that file, and this is the same accepted duplication
 * board.tsx's own defaultLabelFor already has across job-card.tsx and
 * lib/board/optimistic.ts.
 */
type OptimisticAction = { type: "move"; id: string; toKind: StageKind } | { type: "remove"; id: string };

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

/**
 * The phone twin of Board: a grouped list instead of seven
 * horizontally-scrolling columns. Root wrapper carries `flex md:hidden`,
 * the opposite of Board's `hidden md:flex`, so exactly one of the two trees
 * is ever exposed to the accessibility tree at a given viewport width - the
 * other's `display: none` removes it entirely, which is also why this
 * file's rows can reuse JobCard's exact "<role> at <company>" accessible
 * name without clashing.
 *
 * Owns its own useOptimistic over `cards`, its own moveSheetCardId /
 * pendingCloseId / addOpen state, and its own runMove/runClose - the same
 * shape as Board's, including Board's own same-column no-op guard and its
 * try/catch around each awaited action. This duplicates Board's state
 * rather than sharing it, because Board and PhoneBoard are separate
 * mounted component trees with no shared client parent
 * (app/(app)/board/page.tsx is a server component and cannot hold state);
 * only one tree is ever visible at a given viewport width, so the
 * duplication costs nothing a user can observe.
 *
 * actionFailureMessage (lib/board/messages.ts), not a raw messageFor call:
 * this is the exact helper Board's own runMove/runClose call today (a
 * close/reopen failure must not say "move"), so both boards produce
 * byte-identical failure toasts for the same failure.
 */
export function PhoneBoard({
  cards,
  nowIso,
  companyNames,
}: {
  cards: BoardCard[];
  nowIso: string;
  companyNames: string[];
}) {
  const now = new Date(nowIso);
  const announce = useAnnounce();

  const [optimisticCards, dispatchOptimistic] = React.useOptimistic(
    cards,
    (state: BoardCard[], action: OptimisticAction) =>
      action.type === "move" ? applyMove(state, { id: action.id, toKind: action.toKind }) : removeCard(state, action.id),
  );
  const [moveSheetCardId, setMoveSheetCardId] = React.useState<string | null>(null);
  const [pendingCloseId, setPendingCloseId] = React.useState<string | null>(null);
  const [addOpen, setAddOpen] = React.useState(false);
  // Attached to the "Add job" button in both the empty and non-empty
  // branches below (only one is ever mounted at once), so this always
  // points at whichever one is currently on screen - the fallback runClose
  // reaches for once closing a card leaves its whole stage group empty
  // (that group's own heading disappears along with it, unlike the desktop
  // board's column rail, which stays in the DOM to be focused instead).
  const addJobButtonRef = React.useRef<HTMLButtonElement>(null);

  function runMove(cardId: string, target: MoveTarget) {
    const card = optimisticCards.find((c) => c.id === cardId);
    if (!card) return;
    // Same guard, same reasoning as board.tsx's runMove: a move to the
    // card's own column is a silent no-op no matter which trigger asks for
    // it, including MoveSheet's own "current column" row, which - unlike
    // MoveMenu's matching item - is not visually disabled; this guard is
    // what makes choosing it harmless either way.
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
        // The sheet already tried to return focus to the "Move to" button
        // that opened it (Sheet's own default), but that button belonged to
        // this card's row in its OLD group, which unmounted the instant the
        // optimistic dispatch above moved it - so that default landed
        // nowhere. This sends it to the same button's replacement instead,
        // now sitting in the card's new group.
        if (focusWasLost()) {
          focusCardButton(cardId);
        }
      } catch (error) {
        // moveAction can reject before ever returning a Result (board.tsx's
        // runMove hit this first - requireUser()'s own session lookup
        // throws when the database is unreachable). Without this catch the
        // optimistic card would still revert once the transition ends, but
        // silently, with no toast telling the user why.
        console.error("move failed", error);
        toast.error(actionFailureMessage("move", card, "unexpected"));
      }
    });
  }

  function runClose(cardId: string, reason: ClosedReason) {
    const card = optimisticCards.find((c) => c.id === cardId);
    if (!card) return;
    // Read before dispatching the removal below, same reasoning as
    // board.tsx's runClose: a card's neighbors within its own group are
    // only knowable from the list as it stood before that card left it.
    const groupCards = optimisticCards.filter((c) => c.stage.kind === card.stage.kind);
    const fallbackCard = nextFocusCandidate(groupCards, cardId);
    React.startTransition(async () => {
      dispatchOptimistic({ type: "remove", id: cardId });
      try {
        const result = await closeAction(cardId, reason);
        if (!result.ok) {
          toast.error(actionFailureMessage("close", card, result.code));
          return;
        }
        announce(`Closed ${card.roleTitle} at ${card.companyName}.`);
        // Same reasoning as runMove above: the closed card's own row,
        // including its "Move to" button, unmounted the instant the
        // optimistic removal above dropped it from the list.
        if (focusWasLost()) {
          if (fallbackCard) focusCardButton(fallbackCard.id);
          else addJobButtonRef.current?.focus();
        }
      } catch (error) {
        // See runMove's matching catch above.
        console.error("close failed", error);
        toast.error(actionFailureMessage("close", card, "unexpected"));
      }
    });
  }

  function handleConfirmClose(reason: ClosedReason) {
    if (pendingCloseId) runClose(pendingCloseId, reason);
    setPendingCloseId(null);
  }

  const moveSheetCard = moveSheetCardId ? (optimisticCards.find((c) => c.id === moveSheetCardId) ?? null) : null;
  const pendingCloseCard = pendingCloseId ? (optimisticCards.find((c) => c.id === pendingCloseId) ?? null) : null;

  // The server-confirmed prop, not the optimistic view - see board.tsx's
  // identical comment: a job being closed optimistically should not flash
  // this list to its empty state before the server round trip confirms it.
  const isEmpty = cards.length === 0;

  return (
    <div className="flex w-full flex-col gap-4 md:hidden">
      {isEmpty ? (
        <EmptyState
          size="page"
          title="No jobs yet"
          description="Add the first job you are tracking."
          action={
            <Button ref={addJobButtonRef} onClick={() => setAddOpen(true)}>
              Add job
            </Button>
          }
          className="w-full"
        />
      ) : (
        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-end">
            <Button ref={addJobButtonRef} onClick={() => setAddOpen(true)}>
              Add job
            </Button>
          </div>
          {STAGE_KINDS.map((stage) => {
            const stageCards = optimisticCards.filter((card) => card.stage.kind === stage.kind);
            if (stageCards.length === 0) return null;
            const title = columnTitle(stage.kind);
            return (
              <section key={stage.kind}>
                <div className="flex items-center gap-2">
                  <h2 className="text-sm font-medium">{title}</h2>
                  <span className="text-xs tabular-nums opacity-70">{stageCards.length}</span>
                </div>
                <ul className="mt-2 flex flex-col gap-2">
                  {stageCards.map((card) => {
                    const days = daysInStage(card.stage.enteredAt, now);
                    const showStageLabel = card.stage.label !== defaultLabelFor(card.stage.kind);
                    const hasChips = card.fitScore !== null || showStageLabel || days !== null;
                    return (
                      <li key={card.id} className="rounded-lg border bg-card p-3">
                        <div className="flex items-start justify-between gap-2">
                          {/* Same two-span shape as JobCard's own title link
                              (board/job-card.tsx): the company span's text
                              starts with the literal word "at" so the
                              link's accessible name reads "<role> at
                              <company>". No draggable={false} here - there
                              is no drag context on the phone board for the
                              browser's native link-drag to conflict with. */}
                          <Link
                            href={`/jobs/${card.slug}`}
                            title={`${card.roleTitle} at ${card.companyName}`}
                            className="min-w-0 flex-1 rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                          >
                            <span className="block truncate font-medium">{card.roleTitle}</span>
                            <span className="block truncate text-muted-foreground">at {card.companyName}</span>
                          </Link>
                          <Button
                            variant="outline"
                            size="sm"
                            data-card-id={card.id}
                            aria-label={`Move ${card.roleTitle} at ${card.companyName}`}
                            onClick={() => setMoveSheetCardId(card.id)}
                          >
                            Move to
                          </Button>
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
                      </li>
                    );
                  })}
                </ul>
              </section>
            );
          })}
        </div>
      )}
      <MoveSheet
        card={moveSheetCard}
        onOpenChange={(open) => {
          if (!open) setMoveSheetCardId(null);
        }}
        onMove={(target) => {
          if (moveSheetCard) runMove(moveSheetCard.id, target);
        }}
        onRequestClose={() => {
          if (moveSheetCard) setPendingCloseId(moveSheetCard.id);
        }}
      />
      <CloseDialog
        open={pendingCloseId !== null}
        onOpenChange={(open) => {
          if (!open) setPendingCloseId(null);
        }}
        job={pendingCloseCard ? { roleTitle: pendingCloseCard.roleTitle, companyName: pendingCloseCard.companyName } : null}
        onConfirm={handleConfirmClose}
      />
      {/* Its own, independent AddJobDialog mount - a second instance of the
          same dialog component Board renders, not shared with it. Written
          once here, as a stable sibling outside the isEmpty/non-empty
          branches above and not nested inside either one: a card being
          added is exactly the moment cards.length flips 0 to 1, which
          flips isEmpty too, and nesting this inside a branch that can flip
          mid-submission is the exact bug board.tsx's own comment documents
          - one call site at a fixed position keeps this instance mounted
          across that transition, so its state survives. */}
      <AddJobDialog open={addOpen} onOpenChange={setAddOpen} companyNames={companyNames} />
    </div>
  );
}
