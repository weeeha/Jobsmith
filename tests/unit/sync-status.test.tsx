// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach } from "vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import { SyncStatus } from "@/components/offline/sync-status";
import type { QueuedMark } from "@/lib/offline/queue";

const stuckMark = (id: string): QueuedMark => ({
  id, userHash: "aaaa", scope: "job", opportunityId: null, questionKey: "0123456789abcdef", level: "shaky",
  markedAt: "2026-11-21T10:00:00.000Z", drilled: false, failures: 10,
});

describe("SyncStatus", () => {
  beforeEach(() => cleanup());

  it("shows '3 marks waiting to sync' in a polite live region until the queue drains", () => {
    const { rerender } = render(<SyncStatus waiting={3} stuck={[]} onRetry={() => {}} onDiscard={() => {}} />);
    const status = screen.getByRole("status");
    expect(status.textContent).toBe("3 marks waiting to sync");
    expect(status.getAttribute("aria-live")).toBe("polite");
    rerender(<SyncStatus waiting={1} stuck={[]} onRetry={() => {}} onDiscard={() => {}} />);
    expect(screen.getByRole("status").textContent).toBe("1 mark waiting to sync");
    rerender(<SyncStatus waiting={0} stuck={[]} onRetry={() => {}} onDiscard={() => {}} />);
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("a stuck mark shows with Retry and Discard buttons that dispatch retry and discard", async () => {
    const onRetry = vi.fn();
    const onDiscard = vi.fn();
    render(<SyncStatus waiting={0} stuck={[stuckMark("s1")]} onRetry={onRetry} onDiscard={onDiscard} />);
    expect(screen.getByText(/1 mark could not sync/)).toBeTruthy();
    await act(async () => screen.getByRole("button", { name: "Retry" }).click());
    expect(onRetry).toHaveBeenCalledWith("s1");
    await act(async () => screen.getByRole("button", { name: "Discard" }).click());
    expect(onDiscard).toHaveBeenCalledWith("s1");
  });

  it("shows nothing when the queue is empty", () => {
    const { container } = render(<SyncStatus waiting={0} stuck={[]} onRetry={() => {}} onDiscard={() => {}} />);
    expect(container.firstChild).toBeNull();
  });

  it("has no exclamation mark or em dash in its copy", () => {
    const { container } = render(<SyncStatus waiting={2} stuck={[stuckMark("s")]} onRetry={() => {}} onDiscard={() => {}} />);
    expect(container.textContent).not.toMatch(/[!—]/);
  });
});
