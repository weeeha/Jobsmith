// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { DndContext } from "@dnd-kit/core";

import { JobCard } from "@/components/board/job-card";
import { BOARD_NOW, boardCard } from "../helpers/board-card";
import type { BoardCard } from "@/lib/db/scoped";

function renderCard(card: BoardCard) {
  const handlers = { onMove: vi.fn(), onRequestClose: vi.fn(), onRequestNextAction: vi.fn() };
  const view = render(
    <DndContext>
      <JobCard card={card} now={BOARD_NOW} {...handlers} />
    </DndContext>,
  );
  return { ...view, ...handlers };
}

function chips(container: HTMLElement): string[] {
  return Array.from(container.querySelectorAll('[data-slot="badge"]')).map((badge) => badge.textContent ?? "");
}

describe("JobCard: fit chip", () => {
  it("shows the banded chip with its screen-reader text when the job has a score", () => {
    const { container } = renderCard(boardCard({ fitScore: 81 }));
    expect(chips(container)).toEqual(["Fit score 81, strong fit"]);
    expect(container.querySelector("svg.text-status-approved")).not.toBeNull();
  });

  it("shows the partial and weak marks for lower scores", () => {
    expect(chips(renderCard(boardCard({ fitScore: 55 })).container)).toEqual(["Fit score 55, partial fit"]);
    expect(chips(renderCard(boardCard({ id: "other", fitScore: 12 })).container)).toEqual(["Fit score 12, weak fit"]);
  });

  it("shows no chip for a job without a score", () => {
    const { container } = renderCard(boardCard({ fitScore: null }));
    expect(chips(container)).toEqual([]);
    expect(screen.getByRole("link").getAttribute("href")).toBe("/jobs/product-designer-northwind-traders");
  });

  it("keeps the stage label chip after the fit chip", () => {
    const { container } = renderCard(
      boardCard({ fitScore: 81, stage: { id: "s", kind: "saved", label: "Wishlist", enteredAt: null } }),
    );
    expect(chips(container)).toEqual(["Fit score 81, strong fit", "Wishlist"]);
  });
});

describe("JobCard: keys", () => {
  it("n asks for the next action dialog and nothing else", () => {
    const { onMove, onRequestClose, onRequestNextAction } = renderCard(boardCard());
    fireEvent.keyDown(screen.getByRole("link"), { key: "n" });
    expect(onRequestNextAction).toHaveBeenCalledTimes(1);
    expect(onMove).not.toHaveBeenCalled();
    expect(onRequestClose).not.toHaveBeenCalled();
  });

  it("N does the same", () => {
    const { onRequestNextAction } = renderCard(boardCard());
    fireEvent.keyDown(screen.getByRole("link"), { key: "N" });
    expect(onRequestNextAction).toHaveBeenCalledTimes(1);
  });

  it("leaves a held key, and a key with a modifier, to the browser", () => {
    const { onRequestNextAction } = renderCard(boardCard());
    const link = screen.getByRole("link");
    fireEvent.keyDown(link, { key: "n", repeat: true });
    fireEvent.keyDown(link, { key: "n", ctrlKey: true });
    fireEvent.keyDown(link, { key: "n", metaKey: true });
    fireEvent.keyDown(link, { key: "n", altKey: true });
    expect(onRequestNextAction).not.toHaveBeenCalled();
  });

  it("still moves on a digit and closes on c", () => {
    const { onMove, onRequestClose, onRequestNextAction } = renderCard(boardCard());
    const link = screen.getByRole("link");
    fireEvent.keyDown(link, { key: "2" });
    fireEvent.keyDown(link, { key: "c" });
    expect(onMove).toHaveBeenCalledWith({ kind: "applied" });
    expect(onRequestClose).toHaveBeenCalledTimes(1);
    expect(onRequestNextAction).not.toHaveBeenCalled();
  });
});
