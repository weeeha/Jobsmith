import { columnTitle } from "@/lib/pipeline/labels";
import type { StageKind } from "@/lib/pipeline/kinds";

/**
 * The board (desktop and phone) moves a card between columns/groups by
 * unmounting it from its old position and mounting a fresh instance at its
 * new one - so whatever inside it had keyboard focus (the title link, a
 * "Move to" button) is gone the moment that happens, and neither React nor
 * the browser puts focus anywhere in particular afterward. These functions
 * find the right element to send it to instead, once the move, close or
 * reopen the caller is recovering from has actually landed.
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

/** A column's own empty-rail region (board-column.tsx), once a close leaves nothing else in it. */
export function focusColumnRegion(kind: StageKind): void {
  document.querySelector<HTMLElement>(`[aria-label="${columnTitle(kind)}, no jobs"]`)?.focus();
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
