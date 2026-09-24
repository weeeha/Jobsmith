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
    // Deliberately out of sorted order (the correct result of sortCards is
    // [soon, later]) and with distinct nextActionAt values, so a broken
    // implementation that sorted `input` itself in place - rather than a
    // copy of it - would visibly reorder it, unlike two cards tied on every
    // sort key, which stay put under a stable sort whether or not a copy
    // was made.
    const soon = card({ id: "soon", nextActionAt: new Date("2026-09-20T00:00:00.000Z") });
    const later = card({ id: "later", nextActionAt: new Date("2026-09-25T00:00:00.000Z") });
    const input = [later, soon];
    // A snapshot with its own `stage` objects, not shared with `input`'s, so
    // a field-level mutation of a card (e.g. an in-place rewrite of
    // `stage.kind`) would also diverge from it - a shallow `[...input]`
    // copy shares every element's object identity with `input` and so could
    // never catch that class of bug.
    const snapshot = input.map((c) => ({ ...c, stage: { ...c.stage } }));
    sortCards(input);
    expect(input).toEqual(snapshot);
  });
});
