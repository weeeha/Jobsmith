import type { BoardCard } from "@/lib/db/scoped";

export const BOARD_NOW = new Date("2026-10-11T12:00:00.000Z");

/** A saved-column card for component tests. Override only what a test cares about. */
export function boardCard(overrides: Partial<BoardCard> = {}): BoardCard {
  return {
    id: "00000000-0000-4000-8000-0000000000a1",
    slug: "product-designer-northwind-traders",
    roleTitle: "Product Designer",
    companyName: "Northwind Traders",
    fitScore: null,
    nextAction: null,
    nextActionAt: null,
    updatedAt: BOARD_NOW,
    stage: { id: "00000000-0000-4000-8000-0000000000b1", kind: "saved", label: "Saved", enteredAt: null },
    ...overrides,
  };
}
