import { describe, expect, it } from "vitest";
import { applyMove, removeCard } from "@/lib/board/optimistic";
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
    stage: {
      id: "stage-1",
      kind: "saved",
      label: "Saved",
      enteredAt: new Date("2026-09-01T00:00:00.000Z"),
    },
    ...overrides,
  };
}

describe("applyMove", () => {
  it("moves the named card to the target column with its default label", () => {
    const cards = [card({ id: "a" }), card({ id: "b" })];
    const result = applyMove(cards, { id: "a", toKind: "applied" });
    expect(result.find((c) => c.id === "a")?.stage).toMatchObject({ kind: "applied", label: "Applied" });
  });

  it("leaves every other card untouched", () => {
    const cards = [card({ id: "a" }), card({ id: "b" })];
    const result = applyMove(cards, { id: "a", toKind: "applied" });
    expect(result.find((c) => c.id === "b")).toEqual(cards[1]);
  });

  it("keeps enteredAt as it was; the true value is only known after the server round trip", () => {
    const enteredAt = new Date("2026-09-01T00:00:00.000Z");
    const cards = [card({ id: "a", stage: { id: "stage-1", kind: "saved", label: "Saved", enteredAt } })];
    const result = applyMove(cards, { id: "a", toKind: "offer" });
    expect(result[0].stage.enteredAt).toBe(enteredAt);
  });

  it("does not mutate the input array", () => {
    const cards = [card({ id: "a" })];
    const before = cards[0].stage.kind;
    applyMove(cards, { id: "a", toKind: "applied" });
    expect(cards[0].stage.kind).toBe(before);
  });
});

describe("removeCard", () => {
  it("removes the named card", () => {
    const cards = [card({ id: "a" }), card({ id: "b" })];
    expect(removeCard(cards, "a").map((c) => c.id)).toEqual(["b"]);
  });

  it("is a no-op when the id is not present", () => {
    const cards = [card({ id: "a" })];
    expect(removeCard(cards, "missing")).toEqual(cards);
  });
});
