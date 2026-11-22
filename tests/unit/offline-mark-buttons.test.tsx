// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach } from "vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import { Toaster } from "sonner";
import { LiveAnnouncerProvider } from "@/components/live-announcer";
import { MarkButtons } from "@/components/prep/mark-buttons";
import { markQuestionAction } from "@/app/(app)/jobs/[slug]/prep-actions";

const offline = vi.hoisted(() => ({ submit: vi.fn() }));
vi.mock("@/components/offline/offline-provider", () => ({
  useOffline: () => ({ userHash: "aaaa", submit: offline.submit, retry: vi.fn(), discard: vi.fn() }),
}));
vi.mock("@/app/(app)/jobs/[slug]/prep-actions", () => ({ markQuestionAction: vi.fn(), rebuildQuestionsAction: vi.fn() }));

const KEY = "0123456789abcdef";
const JOB = "11111111-1111-4111-8111-111111111111";

function renderButtons() {
  const onMarked = vi.fn();
  render(
    <LiveAnnouncerProvider>
      <Toaster />
      <MarkButtons questionKey={KEY} opportunityId={JOB} scope="job" current={null} onMarked={onMarked} />
    </LiveAnnouncerProvider>,
  );
  return { onMarked };
}

describe("MarkButtons with the offline queue", () => {
  beforeEach(() => {
    cleanup();
    offline.submit.mockReset();
    vi.mocked(markQuestionAction).mockReset();
  });

  it("a queued mark shows the chosen level at once and does not call the action itself", async () => {
    offline.submit.mockResolvedValue({ queued: true });
    const { onMarked } = renderButtons();
    await act(async () => screen.getByRole("button", { name: "Solid" }).click());
    expect(offline.submit).toHaveBeenCalledWith({ opportunityId: JOB, scope: "job", questionKey: KEY, level: "solid", drilled: false });
    expect(onMarked).toHaveBeenCalledWith("solid");
    expect(markQuestionAction).not.toHaveBeenCalled();
  });

  it("a mark that went through reports the level the server kept", async () => {
    offline.submit.mockResolvedValue({ queued: false, result: { ok: true, data: { level: "okay", markedAt: "x", drillCount: 0, applied: false } } });
    const { onMarked } = renderButtons();
    await act(async () => screen.getByRole("button", { name: "Solid" }).click());
    expect(onMarked).toHaveBeenCalledWith("okay");
  });

  it("a server refusal shows its message and keeps the previous level", async () => {
    offline.submit.mockResolvedValue({ queued: false, result: { ok: false, code: "invalid", message: "That question key is not valid." } });
    const { onMarked } = renderButtons();
    await act(async () => screen.getByRole("button", { name: "Shaky" }).click());
    expect(onMarked).not.toHaveBeenCalled();
    expect(await screen.findByText("That question key is not valid.")).toBeTruthy();
  });
});
