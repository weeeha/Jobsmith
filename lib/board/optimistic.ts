import { STAGE_KINDS, type StageKind } from "@/lib/pipeline/kinds";
import type { BoardCard } from "@/lib/db/scoped";

function defaultLabelFor(kind: StageKind): string {
  const entry = STAGE_KINDS.find((s) => s.kind === kind);
  if (!entry) throw new Error(`Unknown stage kind: ${kind}`);
  return entry.defaultLabel;
}

/**
 * Optimistic placeholder for a move: sets the card's column and the
 * column's default label. It does not know the real target stage id (an
 * existing stage of that kind, or one the server is about to create) or the
 * real enteredAt, so stage.id becomes the kind itself, a value nothing
 * downstream keys on, and enteredAt is left as it was. Both are corrected
 * within moments by the server round trip: the optimistic value is dropped
 * when the transition ends and the revalidated page data takes over.
 */
export function applyMove(cards: BoardCard[], move: { id: string; toKind: StageKind }): BoardCard[] {
  return cards.map((card) =>
    card.id === move.id
      ? {
          ...card,
          stage: { ...card.stage, id: move.toKind, kind: move.toKind, label: defaultLabelFor(move.toKind) },
        }
      : card,
  );
}

export function removeCard(cards: BoardCard[], id: string): BoardCard[] {
  return cards.filter((card) => card.id !== id);
}
