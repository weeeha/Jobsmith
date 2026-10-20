// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach } from "vitest";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { LiveAnnouncerProvider } from "@/components/live-announcer";
import { markAppliedFromHomeAction, markDoneFromHomeAction, snoozeFromHomeAction } from "@/app/(app)/home-actions";
import { AttentionList } from "@/components/home/attention-list";
import type { AttentionItem } from "@/lib/attention/items";

vi.mock("@/app/(app)/home-actions", () => ({
  markDoneFromHomeAction: vi.fn(),
  markAppliedFromHomeAction: vi.fn(),
  snoozeFromHomeAction: vi.fn(),
}));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

const at = new Date("2026-10-16T10:30:00Z");
const j = (n: number, role: string) => ({ id: `job-${n}`, slug: `job-${n}`, roleTitle: role, companyName: "Acme", nextAction: null });
const items: AttentionItem[] = [
  { kind: "interview", job: j(1, "Role 1"), stage: { id: "s1", label: "Recruiter screen", scheduledAt: at, format: "video" }, researched: true },
  { kind: "due", job: j(2, "Role 2"), nextAction: "Send link", at, overdue: true },
  { kind: "follow_up", job: j(3, "Role 3"), quietDays: 9, appliedAt: at },
  { kind: "saved", job: j(4, "Role 4"), days: 4, savedAt: at },
  { kind: "passed", job: j(5, "Role 5"), stage: { id: "s5", label: "Hiring manager", scheduledAt: at, format: null } },
];

function renderList(list = items) {
  return render(
    <LiveAnnouncerProvider>
      <AttentionList items={list} />
    </LiveAnnouncerProvider>,
  );
}

describe("AttentionList", () => {
  beforeEach(() => {
    cleanup();
    vi.mocked(markDoneFromHomeAction).mockReset();
    vi.mocked(markAppliedFromHomeAction).mockReset();
    vi.mocked(snoozeFromHomeAction).mockReset();
  });

  it("renders the groups in order with counts", () => {
    renderList();
    const headings = screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent);
    expect(headings).toEqual([
      "Interviews in the next 72 hours 1",
      "Due today or overdue 1",
      "Follow up? 1",
      "Apply or drop 1",
      "Mark it done and add notes 1",
    ]);
  });

  it("shows the right primary action per kind and no Snooze on the interview", () => {
    renderList();
    const prep = screen.getByRole("link", { name: "Open prep" });
    expect(prep.getAttribute("href")).toBe("/jobs/job-1?tab=prep");
    expect(screen.getByRole("button", { name: "Mark done" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Set next action" }).getAttribute("href")).toBe("/jobs/job-3");
    expect(screen.getByRole("button", { name: "Mark applied" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Add notes" }).getAttribute("href")).toBe("/jobs/job-5");

    const interviewGroup = screen.getByRole("group", { name: "Actions for Role 1 at Acme" });
    expect(within(interviewGroup).queryByRole("button", { name: /Snooze/ })).toBeNull();
    expect(screen.getAllByRole("button", { name: /Snooze/ })).toHaveLength(4);
  });

  it("Mark done calls the action with the job id", async () => {
    vi.mocked(markDoneFromHomeAction).mockResolvedValue({ ok: true, data: null });
    renderList();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Mark done" }));
      await Promise.resolve();
    });
    expect(markDoneFromHomeAction).toHaveBeenCalledWith("job-2");
  });

  it("shows the empty state with a board link", () => {
    renderList([]);
    expect(screen.getByText("Nothing needs you today.")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Open the board" }).getAttribute("href")).toBe("/board");
  });
});
