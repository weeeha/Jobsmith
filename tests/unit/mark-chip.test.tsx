// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach } from "vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import { Toaster } from "sonner";
import { LiveAnnouncerProvider } from "@/components/live-announcer";
import { MarkChip } from "@/components/prep/mark-chip";
import { MarkButtons } from "@/components/prep/mark-buttons";
import { markQuestionAction } from "@/app/(app)/jobs/[slug]/prep-actions";

vi.mock("@/app/(app)/jobs/[slug]/prep-actions", () => ({
  markQuestionAction: vi.fn(),
  rebuildQuestionsAction: vi.fn(),
}));

const KEY = "0123456789abcdef";
const JOB = "11111111-1111-4111-8111-111111111111";

describe("MarkChip", () => {
  it("shows the word for each level and nothing for no mark", () => {
    const { container, rerender } = render(<MarkChip level="shaky" />);
    expect(container.textContent).toBe("Shaky");
    rerender(<MarkChip level="okay" />);
    expect(container.textContent).toBe("Okay");
    rerender(<MarkChip level="solid" />);
    expect(container.textContent).toBe("Solid");
    rerender(<MarkChip level={null} />);
    expect(container.textContent).toBe("");
    expect(container.firstChild).toBeNull();
  });

  it("carries the level as text next to its tone class", () => {
    const { container } = render(<MarkChip level="solid" />);
    const chip = container.firstElementChild as HTMLElement;
    expect(chip.textContent).toBe("Solid");
    expect(chip.dataset.level).toBe("solid");
    expect(chip.className).toContain("status-approved-soft");
    cleanup();
    const shaky = render(<MarkChip level="shaky" />).container.firstElementChild as HTMLElement;
    expect(shaky.className).toContain("status-action-soft");
    cleanup();
    const okay = render(<MarkChip level="okay" />).container.firstElementChild as HTMLElement;
    expect(okay.className).toContain("status-pending-soft");
  });
});

function renderButtons(props: Partial<React.ComponentProps<typeof MarkButtons>> = {}) {
  const onMarked = vi.fn();
  render(
    <LiveAnnouncerProvider>
      <Toaster />
      <MarkButtons questionKey={KEY} opportunityId={JOB} scope="job" current={null} onMarked={onMarked} {...props} />
    </LiveAnnouncerProvider>,
  );
  return { onMarked };
}

describe("MarkButtons", () => {
  beforeEach(() => {
    cleanup();
    vi.mocked(markQuestionAction).mockReset();
  });

  it("has three buttons with aria-pressed for the current level", () => {
    renderButtons({ current: "okay" });
    expect(screen.getByRole("button", { name: "Shaky" }).getAttribute("aria-pressed")).toBe("false");
    expect(screen.getByRole("button", { name: "Okay" }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByRole("button", { name: "Solid" }).getAttribute("aria-pressed")).toBe("false");
  });

  it("tapping a mark button calls the action with the question key, level and a markedAt close to now, then announces 'Marked solid.'", async () => {
    vi.useFakeTimers();
    vi.mocked(markQuestionAction).mockResolvedValue({
      ok: true,
      data: { level: "solid", markedAt: new Date().toISOString(), drillCount: 0, applied: true },
    });
    const { onMarked } = renderButtons();
    const before = Date.now();
    await act(async () => {
      screen.getByRole("button", { name: "Solid" }).click();
      await Promise.resolve();
      await Promise.resolve();
      vi.advanceTimersByTime(60);
    });
    const call = vi.mocked(markQuestionAction).mock.calls[0][0];
    expect(call).toMatchObject({ opportunityId: JOB, scope: "job", questionKey: KEY, level: "solid", drilled: false });
    expect(Math.abs(Date.parse(call.markedAt) - before)).toBeLessThan(5000);
    expect(onMarked).toHaveBeenCalledWith("solid");
    expect(screen.getByRole("status").textContent).toBe("Marked solid.");
    vi.useRealTimers();
  });

  it("a failed action shows the error toast and leaves the previous level", async () => {
    vi.mocked(markQuestionAction).mockResolvedValue({ ok: false, code: "invalid", message: "That question key is not valid." });
    const { onMarked } = renderButtons({ current: "okay" });
    await act(async () => {
      screen.getByRole("button", { name: "Shaky" }).click();
    });
    expect(onMarked).not.toHaveBeenCalled();
    expect(await screen.findByText("That question key is not valid.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Okay" }).getAttribute("aria-pressed")).toBe("true");
  });
});
