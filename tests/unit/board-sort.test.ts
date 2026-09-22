import { describe, expect, it } from "vitest";
import { sortCards } from "@/lib/board/sort";
import type { BoardCard } from "@/lib/db/scoped";

function card(overrides: Partial<BoardCard>): BoardCard {
  return {
    id: "id",
    slug: "slug",
    roleTitle: "Product Designer",
    companyName: "Acme Robotics",
    fitScore: null,
    nextAction: null,
    nextActionAt: null,
    updatedAt: new Date("2026-09-01T00:00:00.000Z"),
    stage: { id: "stage", kind: "saved", label: "Saved", enteredAt: null },
    ...overrides,
  };
}

describe("sortCards", () => {
  it("orders by next action date ascending, nulls last", () => {
    const soon = card({ id: "soon", nextActionAt: new Date("2026-09-20T00:00:00.000Z") });
    const later = card({ id: "later", nextActionAt: new Date("2026-09-25T00:00:00.000Z") });
    const none = card({ id: "none", nextActionAt: null });
    expect(sortCards([none, later, soon]).map((c) => c.id)).toEqual(["soon", "later", "none"]);
  });

  it("breaks ties, including two nulls, by updatedAt descending", () => {
    const older = card({ id: "older", updatedAt: new Date("2026-09-01T00:00:00.000Z") });
    const newer = card({ id: "newer", updatedAt: new Date("2026-09-10T00:00:00.000Z") });
    expect(sortCards([older, newer]).map((c) => c.id)).toEqual(["newer", "older"]);
  });

  it("does not mutate the input array", () => {
    const input = [card({ id: "a" }), card({ id: "b" })];
    const copy = [...input];
    sortCards(input);
    expect(input).toEqual(copy);
  });
});
