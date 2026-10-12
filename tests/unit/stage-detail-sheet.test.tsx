// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";

const harness = vi.hoisted(() => ({ toastError: vi.fn() }));

vi.mock("@/app/(app)/board/actions", () => ({ moveAction: vi.fn() }));
vi.mock("@/app/(app)/jobs/[slug]/actions", () => ({ saveStageDetailAction: vi.fn() }));
vi.mock("sonner", () => ({ toast: { error: harness.toastError } }));

import { moveAction } from "@/app/(app)/board/actions";
import { StageDetailSheet } from "@/components/job/stage-detail-sheet";
import { LiveAnnouncerProvider } from "@/components/live-announcer";

const mockedMove = vi.mocked(moveAction);

const MOVED = {
  ok: true as const,
  data: {
    from: { kind: "saved" as const, label: "Saved" },
    to: { stageId: "00000000-0000-4000-8000-0000000000b2", kind: "applied" as const, label: "Applied" },
  },
};

function renderSheet() {
  const onOpenChange = vi.fn();
  const onMoved = vi.fn();
  render(
    <LiveAnnouncerProvider>
      <StageDetailSheet
        open
        onOpenChange={onOpenChange}
        opportunity={{ id: "00000000-0000-4000-8000-0000000000a1", roleTitle: "Product Designer", status: "active" }}
        companyName="Northwind Traders"
        stage={{
          id: "00000000-0000-4000-8000-0000000000b2",
          label: "Applied",
          kind: "applied",
          scheduledAt: null,
          format: null,
          outcomeMd: null,
        }}
        isCurrent={false}
        onMoved={onMoved}
      />
    </LiveAnnouncerProvider>,
  );
  return { onOpenChange, onMoved };
}

async function moveHere() {
  const sheet = await screen.findByRole("dialog", { name: "Applied" });
  await act(async () => {
    fireEvent.click(within(sheet).getByRole("button", { name: "Move here" }));
    await Promise.resolve();
  });
}

beforeEach(() => {
  mockedMove.mockReset();
  harness.toastError.mockReset();
});

describe("StageDetailSheet: Move here", () => {
  it("announces the move, closes, and tells its host once", async () => {
    mockedMove.mockResolvedValue(MOVED);
    const { onOpenChange, onMoved } = renderSheet();
    await moveHere();
    await waitFor(() => expect(onMoved).toHaveBeenCalledTimes(1));
    expect(mockedMove).toHaveBeenCalledWith("00000000-0000-4000-8000-0000000000a1", {
      stageId: "00000000-0000-4000-8000-0000000000b2",
    });
    expect(onOpenChange).toHaveBeenCalledWith(false);
    await waitFor(() =>
      expect(document.querySelector('[aria-live="polite"]')?.textContent).toBe(
        "Moved Product Designer at Northwind Traders to Applied.",
      ),
    );
  });

  it("does not tell its host when the move comes back refused", async () => {
    mockedMove.mockResolvedValue({ ok: false, code: "closed", message: "This job is closed. Reopen it first." });
    const { onOpenChange, onMoved } = renderSheet();
    await moveHere();
    await waitFor(() => expect(harness.toastError).toHaveBeenCalledTimes(1));
    expect(onMoved).not.toHaveBeenCalled();
    expect(onOpenChange).not.toHaveBeenCalled();
  });

  it("does not tell its host when the move request itself fails", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    mockedMove.mockRejectedValue(new Error("offline"));
    const { onMoved } = renderSheet();
    await moveHere();
    await waitFor(() => expect(harness.toastError).toHaveBeenCalledTimes(1));
    expect(onMoved).not.toHaveBeenCalled();
    error.mockRestore();
  });
});
