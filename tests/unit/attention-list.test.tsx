// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { toast } from "sonner";
import { LiveAnnouncerProvider } from "@/components/live-announcer";
import { TimeZoneProvider } from "@/components/time-zone-provider";
import { AttentionList } from "@/components/home/attention-list";
import { snoozeAction } from "@/app/(app)/actions";
import { completeNextActionAction } from "@/app/(app)/jobs/[slug]/actions";
import type { AttentionItem } from "@/lib/attention";

// Same style as the other component tests here: no jest-dom, direct DOM reads.
vi.mock("@/app/(app)/actions", () => ({ snoozeAction: vi.fn() }));
vi.mock("@/app/(app)/jobs/[slug]/actions", () => ({ completeNextActionAction: vi.fn() }));

const mockedSnooze = vi.mocked(snoozeAction);
const mockedDone = vi.mocked(completeNextActionAction);

function item(overrides: Partial<AttentionItem> = {}): AttentionItem {
  return {
    key: "follow_up:job-1",
    rule: "follow_up",
    opportunityId: "job-1",
    slug: "product-designer-acme",
    roleTitle: "Product Designer",
    companyName: "Acme Robotics",
    at: new Date("2026-10-02T09:00:00.000Z"),
    stage: null,
    nextAction: null,
    days: 9,
    overdue: false,
    snoozable: true,
    ...overrides,
  };
}

const INTERVIEW = item({
  key: "interview_soon:stage-1",
  rule: "interview_soon",
  at: new Date("2026-10-12T14:00:00.000Z"),
  stage: { id: "stage-1", label: "Phone screen" },
  days: null,
  snoozable: false,
});
const DUE = item({
  key: "next_action_due:job-1",
  rule: "next_action_due",
  at: new Date("2026-10-11T15:00:00.000Z"),
  nextAction: "Send portfolio",
  days: null,
});
const OVERDUE = { ...DUE, overdue: true, at: new Date("2026-10-09T15:00:00.000Z") };
const FOLLOW_UP = item();
const APPLY = item({ key: "apply_or_drop:job-1", rule: "apply_or_drop", days: 4 });
const MARK_DONE = item({
  key: "mark_done:stage-2",
  rule: "mark_done",
  at: new Date("2026-10-10T14:00:00.000Z"),
  stage: { id: "stage-2", label: "Technical interview" },
  days: null,
  snoozable: false,
});

function renderList(items: AttentionItem[]) {
  const view = (list: AttentionItem[]) => (
    <LiveAnnouncerProvider>
      <TimeZoneProvider zone="UTC">
        <h2 id="home-today" tabIndex={-1}>
          Today
        </h2>
        <AttentionList items={list} />
      </TimeZoneProvider>
    </LiveAnnouncerProvider>
  );
  const utils = render(view(items));
  return { ...utils, rerenderWith: (list: AttentionItem[]) => utils.rerender(view(list)) };
}

function reasonOf(li: HTMLElement): string {
  return li.querySelector("[data-attention-reason]")?.textContent ?? "";
}

async function openSnoozeMenu(label: string) {
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: label }));
  });
}

beforeEach(() => {
  mockedSnooze.mockReset();
  mockedDone.mockReset();
  vi.restoreAllMocks();
});

describe("AttentionList", () => {
  it("is a list named Things to do today with a job link per item", () => {
    renderList([FOLLOW_UP, { ...APPLY, opportunityId: "job-2", slug: "design-lead-northwind", roleTitle: "Design Lead", companyName: "Northwind Traders" }]);
    const list = screen.getByRole("list", { name: "Things to do today" });
    const rows = within(list).getAllByRole("listitem");
    expect(rows).toHaveLength(2);
    const link = within(rows[1]!).getByRole("link", { name: "Design Lead at Northwind Traders" });
    expect(link.getAttribute("href")).toBe("/jobs/design-lead-northwind");
  });

  // An unbroken name has no space to wrap at, so the elements that hold it
  // must be allowed to break inside a word.
  it("lets an 80-character role and company name break inside the word", () => {
    renderList([item({ roleTitle: "r".repeat(80), companyName: "c".repeat(80), nextAction: "n".repeat(80), rule: "next_action_due", key: "next_action_due:job-1" })]);
    const link = screen.getByRole("link", { name: `${"r".repeat(80)} at ${"c".repeat(80)}` });
    expect(link.className).toContain("break-words");
    const reason = document.querySelector("[data-attention-reason]") as HTMLElement;
    expect(reason.textContent).toContain("n".repeat(80));
    expect(reason.className).toContain("break-words");
  });

  it.each([
    ["interview_soon", INTERVIEW, /^Phone screen, .+$/],
    ["next_action_due", DUE, /^Send portfolio\. Due .+\.$/],
    ["next_action_due overdue", OVERDUE, /^Send portfolio\. Overdue since .+\.$/],
    ["follow_up", FOLLOW_UP, /^Follow up\? No news for 9 days\.$/],
    ["apply_or_drop", APPLY, /^Apply or drop\. Saved 4 days ago\.$/],
    ["mark_done", MARK_DONE, /^Technical interview was .+\. Mark it done and add notes\.$/],
  ])("%s: reason text", (_name, entry, pattern) => {
    renderList([entry]);
    expect(reasonOf(screen.getByRole("listitem"))).toMatch(pattern);
  });

  it("says 1 day, not 1 days", () => {
    renderList([item({ days: 1 })]);
    expect(reasonOf(screen.getByRole("listitem"))).toBe("Follow up? No news for 1 day.");
  });

  it("puts the time in a <time> element with the instant", () => {
    renderList([DUE]);
    const time = screen.getByRole("listitem").querySelector("time");
    expect(time?.getAttribute("datetime")).toBe("2026-10-11T15:00:00.000Z");
  });

  it("gives each rule one primary action", () => {
    renderList([INTERVIEW, DUE, FOLLOW_UP, APPLY, MARK_DONE]);
    const rows = screen.getAllByRole("listitem");
    const prep = within(rows[0]!).getByRole("link", { name: "Open prep for Product Designer at Acme Robotics" });
    expect(prep.getAttribute("href")).toBe("/jobs/product-designer-acme?tab=prep");
    expect(prep.textContent).toBe("Open prep");
    const done = within(rows[1]!).getByRole("button", { name: "Mark the next action done for Product Designer at Acme Robotics" });
    expect(done.textContent).toBe("Done");
    for (const index of [2, 3, 4]) {
      const open = within(rows[index]!).getByRole("link", { name: "Open Product Designer at Acme Robotics" });
      expect(open.textContent).toBe("Open job");
      expect(open.getAttribute("href")).toBe("/jobs/product-designer-acme");
    }
  });

  it("offers Snooze on due next actions, follow-ups and apply-or-drop items only", () => {
    renderList([INTERVIEW, DUE, FOLLOW_UP, APPLY, MARK_DONE]);
    const rows = screen.getAllByRole("listitem");
    const snoozeIn = (index: number) => within(rows[index]!).queryByRole("button", { name: "Snooze Product Designer at Acme Robotics" });
    expect(snoozeIn(0)).toBeNull();
    expect(snoozeIn(1)).not.toBeNull();
    expect(snoozeIn(2)).not.toBeNull();
    expect(snoozeIn(3)).not.toBeNull();
    expect(snoozeIn(4)).toBeNull();
  });

  it("lists the three presets and posts the rule and the chosen preset", async () => {
    mockedSnooze.mockResolvedValue({ ok: true, data: null });
    renderList([FOLLOW_UP]);
    await openSnoozeMenu("Snooze Product Designer at Acme Robotics");
    const items = screen.getAllByRole("menuitem").map((entry) => entry.textContent);
    expect(items).toEqual(["Until tomorrow", "For 3 days", "For a week"]);

    await act(async () => {
      fireEvent.click(screen.getByRole("menuitem", { name: "For 3 days" }));
    });
    expect(mockedSnooze).toHaveBeenCalledWith("job-1", "follow_up", "in_3_days");
  });

  it("announces a snooze and moves focus to Today once the item is gone", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] });
    mockedSnooze.mockResolvedValue({ ok: true, data: null });
    const { rerenderWith } = renderList([FOLLOW_UP]);
    await openSnoozeMenu("Snooze Product Designer at Acme Robotics");
    await act(async () => {
      fireEvent.click(screen.getByRole("menuitem", { name: "Until tomorrow" }));
      await Promise.resolve();
    });
    // The server action revalidates Home, so the row disappears and focus
    // falls back to <body>.
    await act(async () => {
      rerenderWith([]);
      (document.activeElement as HTMLElement | null)?.blur();
      vi.advanceTimersByTime(200);
    });

    expect(screen.getByRole("status").textContent).toBe("Snoozed Product Designer at Acme Robotics.");
    expect(document.activeElement).toBe(document.getElementById("home-today"));
    vi.useRealTimers();
  });

  it("marks a next action done, announces it, and calls the existing action with the job id", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] });
    mockedDone.mockResolvedValue({ ok: true, data: null });
    renderList([DUE]);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Mark the next action done for Product Designer at Acme Robotics" }));
      await Promise.resolve();
      vi.advanceTimersByTime(60);
    });
    expect(mockedDone).toHaveBeenCalledWith("job-1");
    expect(screen.getByRole("status").textContent).toBe("Marked the next action done for Product Designer at Acme Robotics.");
    vi.useRealTimers();
  });

  it("toasts a failed snooze with the server's message and does not announce", async () => {
    // The announcer speaks 50 ms after it is called, so the clock is moved
    // past that before the status region is read.
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] });
    mockedSnooze.mockResolvedValue({ ok: false, code: "closed", message: "This job is closed. Reopen it first." });
    const toastError = vi.spyOn(toast, "error");
    renderList([FOLLOW_UP]);
    await openSnoozeMenu("Snooze Product Designer at Acme Robotics");
    await act(async () => {
      fireEvent.click(screen.getByRole("menuitem", { name: "For a week" }));
      await Promise.resolve();
      vi.advanceTimersByTime(200);
    });
    vi.useRealTimers();
    expect(toastError).toHaveBeenCalledWith(
      "Could not snooze Product Designer at Acme Robotics. This job is closed. Reopen it first.",
    );
    expect(screen.getByRole("status").textContent).toBe("");
    expect(document.activeElement).not.toBe(document.getElementById("home-today"));
  });

  it("toasts a failed Done and a rejected action, and keeps the row", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const toastError = vi.spyOn(toast, "error");
    renderList([DUE]);
    const button = screen.getByRole("button", { name: "Mark the next action done for Product Designer at Acme Robotics" });

    mockedDone.mockResolvedValueOnce({ ok: false, code: "nothing_to_complete", message: "There is no next action." });
    await act(async () => {
      fireEvent.click(button);
      await Promise.resolve();
    });
    expect(toastError).toHaveBeenLastCalledWith("Could not mark the next action done. There is no next action.");

    mockedDone.mockRejectedValueOnce(new Error("network"));
    await act(async () => {
      fireEvent.click(button);
      await Promise.resolve();
    });
    expect(toastError).toHaveBeenLastCalledWith("Could not mark the next action done. Something went wrong. Try again.");
    expect(screen.getByRole("status").textContent).toBe("");
    expect(screen.getAllByRole("listitem")).toHaveLength(1);
  });
});
