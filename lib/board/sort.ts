import type { BoardCard } from "@/lib/db/scoped";

export function sortCards(cards: BoardCard[]): BoardCard[] {
  return [...cards].sort((a, b) => {
    const aTime = a.nextActionAt ? a.nextActionAt.getTime() : Number.POSITIVE_INFINITY;
    const bTime = b.nextActionAt ? b.nextActionAt.getTime() : Number.POSITIVE_INFINITY;
    if (aTime !== bTime) return aTime - bTime;
    return b.updatedAt.getTime() - a.updatedAt.getTime();
  });
}
