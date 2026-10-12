// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { render } from "@testing-library/react";

vi.mock("@/app/(app)/board/actions", () => ({ moveAction: vi.fn(), closeAction: vi.fn(), addJobAction: vi.fn() }));

import { LiveAnnouncerProvider } from "@/components/live-announcer";
import { PhoneBoard } from "@/components/board/phone-board";
import { BOARD_NOW, boardCard } from "../helpers/board-card";
import type { BoardCard } from "@/lib/db/scoped";

function renderBoard(cards: BoardCard[]) {
  return render(
    <LiveAnnouncerProvider>
      <PhoneBoard cards={cards} nowIso={BOARD_NOW.toISOString()} companyNames={["Northwind Traders"]} />
    </LiveAnnouncerProvider>,
  );
}

function chips(container: HTMLElement): string[] {
  return Array.from(container.querySelectorAll('[data-slot="badge"]')).map((badge) => badge.textContent ?? "");
}

describe("PhoneBoard: fit chip", () => {
  it("shows the banded chip on a scored job", () => {
    const { container } = renderBoard([boardCard({ fitScore: 81 })]);
    expect(chips(container)).toEqual(["Fit score 81, strong fit"]);
    expect(container.querySelector("svg.text-status-approved")).not.toBeNull();
  });

  it("shows no chip on an unscored job", () => {
    const { container } = renderBoard([boardCard({ fitScore: null })]);
    expect(chips(container)).toEqual([]);
  });
});
