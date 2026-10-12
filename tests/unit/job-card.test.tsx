// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { DndContext } from "@dnd-kit/core";

import { JobCard } from "@/components/board/job-card";
import { BOARD_NOW, boardCard } from "../helpers/board-card";
import type { BoardCard } from "@/lib/db/scoped";

function renderCard(card: BoardCard) {
  return render(
    <DndContext>
      <JobCard card={card} now={BOARD_NOW} onMove={vi.fn()} onRequestClose={vi.fn()} />
    </DndContext>,
  );
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
