// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";

const harness = vi.hoisted(() => ({ offer: vi.fn(), toastError: vi.fn() }));

vi.mock("@/app/(app)/board/actions", () => ({ moveAction: vi.fn(), closeAction: vi.fn(), addJobAction: vi.fn() }));
vi.mock("@/app/(app)/jobs/[slug]/actions", () => ({ setNextActionAction: vi.fn() }));
vi.mock("@/components/next-action/offer", () => ({ offerNextAction: harness.offer }));
vi.mock("sonner", () => ({ toast: { error: harness.toastError } }));

import { moveAction } from "@/app/(app)/board/actions";
import { setNextActionAction } from "@/app/(app)/jobs/[slug]/actions";
import { Board } from "@/components/board/board";
import { LiveAnnouncerProvider } from "@/components/live-announcer";
import { TimeZoneProvider } from "@/components/time-zone-provider";
import { BOARD_NOW, boardCard } from "../helpers/board-card";
import type { BoardCard } from "@/lib/db/scoped";

const mockedMove = vi.mocked(moveAction);
const mockedSetNextAction = vi.mocked(setNextActionAction);

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
      <TimeZoneProvider zone="UTC">
        <Board cards={cards} nowIso={BOARD_NOW.toISOString()} companyNames={["Northwind Traders"]} />
      </TimeZoneProvider>
    </LiveAnnouncerProvider>,
  );
}

function cardLink(): HTMLElement {
  return screen.getByRole("link");
}

async function press(key: string) {
  await act(async () => {
    fireEvent.keyDown(cardLink(), { key });
    await Promise.resolve();
  });
}

function announced(): string | undefined {
  return document.querySelector('[aria-live="polite"]')?.textContent ?? undefined;
}

// correctFocusOnceLost keeps polling for a second and a half after a move. Left
// on real timers, one test's polling would refocus the next test's card and
// hide a missing focus restore, so the clock is faked (still advancing by
// itself, which Testing Library's waitFor needs) and emptied after each test.
beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  mockedMove.mockReset();
  mockedSetNextAction.mockReset();
  harness.offer.mockReset();
  harness.toastError.mockReset();
});

afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
});

describe("Board: the next action offer after a move", () => {
  it("offers once, naming the job, after a successful move", async () => {
    mockedMove.mockResolvedValue(MOVED);
    renderBoard([boardCard()]);
    await press("2");
    await waitFor(() => expect(harness.offer).toHaveBeenCalledTimes(1));
    expect(mockedMove).toHaveBeenCalledWith("00000000-0000-4000-8000-0000000000a1", { kind: "applied" });
    expect(harness.offer.mock.calls[0][0]).toMatchObject({ roleTitle: "Product Designer", companyName: "Northwind Traders" });
    await waitFor(() => expect(announced()).toBe("Moved Product Designer at Northwind Traders to Applied."));
  });

  it("does not offer when the move comes back refused", async () => {
    mockedMove.mockResolvedValue({ ok: false, code: "closed", message: "This job is closed. Reopen it first." });
    renderBoard([boardCard()]);
    await press("2");
    await waitFor(() => expect(harness.toastError).toHaveBeenCalledTimes(1));
    expect(harness.offer).not.toHaveBeenCalled();
  });

  it("does not offer when the move request itself fails", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    mockedMove.mockRejectedValue(new Error("offline"));
    renderBoard([boardCard()]);
    await press("2");
    await waitFor(() => expect(harness.toastError).toHaveBeenCalledTimes(1));
    expect(harness.offer).not.toHaveBeenCalled();
    error.mockRestore();
  });

  it("does not offer for a move to the card's own column, which is not a move", async () => {
    renderBoard([boardCard()]);
    await press("1");
    expect(mockedMove).not.toHaveBeenCalled();
    expect(harness.offer).not.toHaveBeenCalled();
  });

  it("opens nothing until the offer's button is used", async () => {
    mockedMove.mockResolvedValue(MOVED);
    renderBoard([boardCard()]);
    await press("2");
    await waitFor(() => expect(harness.offer).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("opens the dialog, filled with the job's next action, when the offer's button runs", async () => {
    mockedMove.mockResolvedValue(MOVED);
    renderBoard([
      boardCard({ nextAction: "Send the portfolio", nextActionAt: new Date("2026-10-12T09:00:00.000Z") }),
    ]);
    await press("2");
    await waitFor(() => expect(harness.offer).toHaveBeenCalledTimes(1));
    const open = harness.offer.mock.calls[0][1] as () => void;
    await act(async () => {
      open();
    });
    const dialog = await screen.findByRole("dialog", { name: "Set the next action" });
    expect(within(dialog).getByText("Product Designer at Northwind Traders")).toBeTruthy();
    expect((within(dialog).getByLabelText("What is next") as HTMLInputElement).value).toBe("Send the portfolio");
  });
});

describe("Board: the n key", () => {
  it("opens the dialog on the focused card without moving it", async () => {
    renderBoard([boardCard()]);
    await press("n");
    expect(await screen.findByRole("dialog", { name: "Set the next action" })).toBeTruthy();
    expect(mockedMove).not.toHaveBeenCalled();
    expect(harness.offer).not.toHaveBeenCalled();
  });

  it("sends focus back to the card's title link after Cancel, even when focus had already left it", async () => {
    renderBoard([boardCard()]);
    cardLink().blur();
    await press("n");
    const dialog = await screen.findByRole("dialog", { name: "Set the next action" });
    await act(async () => {
      fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
    });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(cardLink()));
  });

  it("saves through the action for that job, announces it, and restores focus", async () => {
    mockedSetNextAction.mockResolvedValue({ ok: true });
    renderBoard([boardCard()]);
    cardLink().blur();
    await press("n");
    const dialog = await screen.findByRole("dialog", { name: "Set the next action" });
    await act(async () => {
      fireEvent.change(within(dialog).getByLabelText("What is next"), { target: { value: "Send the portfolio" } });
    });
    await act(async () => {
      fireEvent.click(within(dialog).getByRole("button", { name: "Save" }));
      await Promise.resolve();
    });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    const [id, , formData] = mockedSetNextAction.mock.calls[0] as unknown as [string, unknown, FormData];
    expect(id).toBe("00000000-0000-4000-8000-0000000000a1");
    expect(formData.get("text")).toBe("Send the portfolio");
    await waitFor(() => expect(announced()).toBe("Next action saved for Product Designer at Northwind Traders."));
    await waitFor(() => expect(document.activeElement).toBe(cardLink()));
  });
});
