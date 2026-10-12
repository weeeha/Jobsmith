// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";

const harness = vi.hoisted(() => ({ offer: vi.fn(), toastError: vi.fn() }));

vi.mock("@/app/(app)/board/actions", () => ({ moveAction: vi.fn() }));
vi.mock("@/app/(app)/jobs/[slug]/actions", () => ({ saveStageDetailAction: vi.fn(), setNextActionAction: vi.fn() }));
vi.mock("@/components/next-action/offer", () => ({ offerNextAction: harness.offer }));
vi.mock("sonner", () => ({ toast: { error: harness.toastError } }));

import { moveAction } from "@/app/(app)/board/actions";
import { LiveAnnouncerProvider } from "@/components/live-announcer";
import { StageStepper } from "@/components/job/stage-stepper";
import { TimeZoneProvider } from "@/components/time-zone-provider";

const mockedMove = vi.mocked(moveAction);

const STAGE_IDS = {
  saved: "00000000-0000-4000-8000-0000000000b1",
  applied: "00000000-0000-4000-8000-0000000000b2",
};

function stage(id: string, kind: "saved" | "applied", label: string, status: "done" | "upcoming") {
  return { id, kind, label, status, scheduledAt: null, completedAt: null, format: null, outcomeMd: null };
}

function renderStepper() {
  return render(
    <LiveAnnouncerProvider>
      <TimeZoneProvider zone="UTC">
        {/* Stands in for NextActionBar's Add or Edit button, which the job
            page renders next to the stepper. */}
        <button data-next-action-trigger>Edit</button>
        <StageStepper
          opportunity={{
            id: "00000000-0000-4000-8000-0000000000a1",
            roleTitle: "Product Designer",
            status: "active",
            nextAction: "Send the portfolio",
            nextActionAt: new Date("2026-10-12T09:00:00.000Z"),
          }}
          companyName="Northwind Traders"
          stages={[stage(STAGE_IDS.saved, "saved", "Saved", "done"), stage(STAGE_IDS.applied, "applied", "Applied", "upcoming")]}
          currentStageId={STAGE_IDS.saved}
          controls={{}}
        />
      </TimeZoneProvider>
    </LiveAnnouncerProvider>,
  );
}

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

describe("StageStepper: the next action offer", () => {
  it("offers after Move here, opens the dialog from the offer, and returns focus to the next action button", async () => {
    mockedMove.mockResolvedValue({
      ok: true,
      data: {
        from: { kind: "saved", label: "Saved" },
        to: { stageId: STAGE_IDS.applied, kind: "applied", label: "Applied" },
      },
    });
    renderStepper();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Applied, upcoming" }));
    });
    const sheet = await screen.findByRole("dialog", { name: "Applied" });
    await act(async () => {
      fireEvent.click(within(sheet).getByRole("button", { name: "Move here" }));
      await Promise.resolve();
    });

    await waitFor(() => expect(harness.offer).toHaveBeenCalledTimes(1));
    expect(harness.offer.mock.calls[0][0]).toEqual({ roleTitle: "Product Designer", companyName: "Northwind Traders" });
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Applied" })).toBeNull());
    expect(screen.queryByRole("dialog")).toBeNull();

    (document.activeElement as HTMLElement | null)?.blur();
    const open = harness.offer.mock.calls[0][1] as () => void;
    await act(async () => {
      open();
    });
    const dialog = await screen.findByRole("dialog", { name: "Set the next action" });
    expect((within(dialog).getByLabelText("What is next") as HTMLInputElement).value).toBe("Send the portfolio");
    await act(async () => {
      fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
    });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(document.querySelector("[data-next-action-trigger]")));
  });

  it("offers nothing when the move is refused", async () => {
    mockedMove.mockResolvedValue({ ok: false, code: "closed", message: "This job is closed. Reopen it first." });
    renderStepper();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Applied, upcoming" }));
    });
    const sheet = await screen.findByRole("dialog", { name: "Applied" });
    await act(async () => {
      fireEvent.click(within(sheet).getByRole("button", { name: "Move here" }));
      await Promise.resolve();
    });
    await waitFor(() => expect(harness.toastError).toHaveBeenCalledTimes(1));
    expect(harness.offer).not.toHaveBeenCalled();
  });
});
