// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";

const harness = vi.hoisted(() => ({ offer: vi.fn(), toastError: vi.fn() }));

vi.mock("@/app/(app)/board/actions", () => ({ moveAction: vi.fn(), closeAction: vi.fn(), addJobAction: vi.fn() }));
vi.mock("@/app/(app)/jobs/[slug]/actions", () => ({ setNextActionAction: vi.fn() }));
vi.mock("@/components/next-action/offer", () => ({ offerNextAction: harness.offer }));
vi.mock("sonner", () => ({ toast: { error: harness.toastError } }));

import { moveAction } from "@/app/(app)/board/actions";
import { LiveAnnouncerProvider } from "@/components/live-announcer";
import { PhoneBoard } from "@/components/board/phone-board";
import { BOARD_NOW, boardCard } from "../helpers/board-card";
import type { BoardCard } from "@/lib/db/scoped";

const mockedMove = vi.mocked(moveAction);

const MOVED = {
  ok: true as const,
  data: {
    from: { kind: "saved" as const, label: "Saved" },
    to: { stageId: "00000000-0000-4000-8000-0000000000b2", kind: "applied" as const, label: "Applied" },
  },
};

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

function moveButton(): HTMLElement {
  return screen.getByRole("button", { name: "Move Product Designer at Northwind Traders" });
}

// Opens the Move to sheet and picks a column, as a thumb would.
async function moveThroughSheet(column: string) {
  await act(async () => {
    fireEvent.click(moveButton());
  });
  const sheet = await screen.findByRole("dialog", { name: "Move to" });
  await act(async () => {
    fireEvent.click(within(sheet).getByRole("button", { name: column }));
    await Promise.resolve();
  });
}

// correctFocusOnceLost keeps polling for a second and a half after a move. Left
// on real timers, one test's polling would refocus the next test's card and
// hide a missing focus restore, so the clock is faked (still advancing by
// itself, which Testing Library's waitFor needs) and emptied after each test.
beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  mockedMove.mockReset();
  harness.offer.mockReset();
  harness.toastError.mockReset();
});

afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
});

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

describe("PhoneBoard: the next action offer after a move", () => {
  it("offers once, naming the job, after a successful move through the sheet", async () => {
    mockedMove.mockResolvedValue(MOVED);
    renderBoard([boardCard()]);
    await moveThroughSheet("Applied");
    await waitFor(() => expect(harness.offer).toHaveBeenCalledTimes(1));
    expect(mockedMove).toHaveBeenCalledWith("00000000-0000-4000-8000-0000000000a1", { kind: "applied" });
    expect(harness.offer.mock.calls[0][0]).toMatchObject({ roleTitle: "Product Designer", companyName: "Northwind Traders" });
    expect(screen.queryByRole("dialog", { name: "Set the next action" })).toBeNull();
  });

  it("does not offer when the move comes back refused", async () => {
    mockedMove.mockResolvedValue({ ok: false, code: "closed", message: "This job is closed. Reopen it first." });
    renderBoard([boardCard()]);
    await moveThroughSheet("Applied");
    await waitFor(() => expect(harness.toastError).toHaveBeenCalledTimes(1));
    expect(harness.offer).not.toHaveBeenCalled();
  });

  it("does not offer when the move request itself fails", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    mockedMove.mockRejectedValue(new Error("offline"));
    renderBoard([boardCard()]);
    await moveThroughSheet("Applied");
    await waitFor(() => expect(harness.toastError).toHaveBeenCalledTimes(1));
    expect(harness.offer).not.toHaveBeenCalled();
    error.mockRestore();
  });

  it("does not offer for the card's own column", async () => {
    renderBoard([boardCard()]);
    await moveThroughSheet("Saved");
    expect(mockedMove).not.toHaveBeenCalled();
    expect(harness.offer).not.toHaveBeenCalled();
  });

  it("opens the dialog when the offer's button runs, and sends focus back to the card's Move to button", async () => {
    mockedMove.mockResolvedValue(MOVED);
    renderBoard([boardCard()]);
    await moveThroughSheet("Applied");
    await waitFor(() => expect(harness.offer).toHaveBeenCalledTimes(1));
    // Let the move's own focus polling finish, so only the dialog's close
    // can put focus back.
    await act(async () => {
      vi.advanceTimersByTime(1_700);
    });
    (document.activeElement as HTMLElement | null)?.blur();

    const open = harness.offer.mock.calls[0][1] as () => void;
    await act(async () => {
      open();
    });
    const dialog = await screen.findByRole("dialog", { name: "Set the next action" });
    expect(within(dialog).getByText("Product Designer at Northwind Traders")).toBeTruthy();
    await act(async () => {
      fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
    });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(moveButton()));
  });
});
