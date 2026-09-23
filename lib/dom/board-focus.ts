import type { StageKind } from "@/lib/pipeline/kinds";

/**
 * The board (desktop and phone) moves a card between columns/groups by
 * unmounting it from its old position and mounting a fresh instance at its
 * new one - so whatever inside it had keyboard focus (the title link, a
 * "Move to" button) is gone the moment that happens, and neither React nor
 * the browser puts focus anywhere in particular afterward. These functions
 * find the right element to send it to instead, once the move, close or
 * reopen the caller is recovering from has actually landed.
 *
 * Every lookup here runs against the live DOM at the moment focus is
 * actually being restored, never against a list snapshot taken before the
 * close or move's own round trip to the server: the three browser projects
 * share one board and one account, so another one's own card can land in
 * or leave the very column being checked while that round trip is in
 * flight, and a decision made ahead of time about "is this column about to
 * be empty" can already be wrong by the time it is acted on.
 */

/** The moved card's own title link, in whichever column it now sits in (job-card.tsx's own data-card-id marker). */
export function focusCardLink(cardId: string): void {
  document.querySelector<HTMLElement>(`a[data-card-id="${cardId}"]`)?.focus();
}

/**
 * A card's own button carrying a data-card-id marker: the phone board's
 * "Move to" button after a move (phone-board.tsx), or the closed list's
 * "Reopen" button after a neighboring row is reopened (closed-list.tsx).
 * The two never coexist in the same page (one view or the other is what the
 * server renders for a given `?view=`), so the plain tag-plus-attribute
 * selector needs no further scoping to tell them apart.
 */
export function focusCardButton(cardId: string): void {
  document.querySelector<HTMLElement>(`button[data-card-id="${cardId}"]`)?.focus();
}

/**
 * After a close on the desktop board: whichever card is currently first in
 * the given column (board-column.tsx's own data-column-kind marker), or
 * the column's own container when the column has nothing left in it right
 * now. The container carries tabIndex={-1} in both its populated and empty
 * states for exactly this fallback - but when the closed card was the last
 * one anywhere on the board, Board itself switches its whole column tree
 * out for its empty-board state (board.tsx's own `isEmpty` branch), taking
 * every column's container down with it. Returns whether it actually found
 * something to focus, so the caller can fall back further (to its own
 * "Add job" button) when the column - and the rest of the board with it -
 * is gone entirely, confirmed as the real cause of an otherwise
 * unreproducible-looking failure by instrumenting a single-card board and
 * seeing zero elements carrying this marker at all.
 */
export function focusColumnCardOrRegion(kind: StageKind): boolean {
  const column = document.querySelector<HTMLElement>(`[data-column-kind="${kind}"]`);
  if (!column) return false;
  const card = column.querySelector<HTMLElement>("a[data-card-id]");
  (card ?? column).focus();
  return true;
}

/**
 * After a close on the phone board: whichever card is currently first in
 * the given stage group (phone-board.tsx's own data-group-kind marker), or
 * `fallback` when the group has nothing left in it right now. Unlike the
 * desktop column above, a phone group's own <section> is not rendered at
 * all once it has no cards (phone-board.tsx hides empty groups), so there
 * is no persistent container of its own to fall back to - the caller
 * supplies one instead (its own "Add job" button).
 */
export function focusGroupCardOrFallback(kind: StageKind, fallback: HTMLElement | null): void {
  const group = document.querySelector<HTMLElement>(`[data-group-kind="${kind}"]`);
  const card = group?.querySelector<HTMLElement>("button[data-card-id]") ?? null;
  (card ?? fallback)?.focus();
}

/** The "Closed" board-view toggle (board.tsx's BoardViewSwitch), once reopening leaves the closed list empty. */
export function focusClosedViewToggle(): void {
  for (const item of document.querySelectorAll<HTMLElement>('[data-slot="mode-tabs-item"]')) {
    if (item.textContent?.trim() === "Closed") {
      item.focus();
      return;
    }
  }
}

/**
 * Which item a list should send focus to once `removedId` is gone from it:
 * whatever came right after it in the list `removedId` used to be part of
 * (a card list, sorted by column or by group), or the one right before it
 * when it was last, or nothing when the list is now empty. `list` is the
 * list as it stood before the removal - the caller reads this before
 * dispatching the removal, since the removed item's neighbors are only
 * knowable from that snapshot.
 */
export function nextFocusCandidate<T extends { id: string }>(list: T[], removedId: string): T | null {
  const index = list.findIndex((item) => item.id === removedId);
  if (index === -1) return null;
  return list[index + 1] ?? list[index - 1] ?? null;
}
