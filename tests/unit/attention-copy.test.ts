import { describe, expect, it } from "vitest";
import { GROUP_TITLES, homeSubline, itemCopy, primaryAction, snoozedMessage } from "@/lib/attention/copy";
import type { AttentionItem } from "@/lib/attention/items";

const job = { id: "j1", slug: "lead-at-northwind", roleTitle: "Design Lead", companyName: "Northwind Labs", nextAction: null };
const at = new Date("2026-10-16T10:30:00Z");

describe("homeSubline", () => {
  it("handles none, one and many", () => {
    expect(homeSubline(0)).toBeNull();
    expect(homeSubline(1)).toBe("1 thing needs you today.");
    expect(homeSubline(6)).toBe("6 things need you today.");
  });
});

describe("itemCopy and primaryAction", () => {
  it("interview", () => {
    const item: AttentionItem = { kind: "interview", job, stage: { id: "s1", label: "Recruiter screen", scheduledAt: at, format: "phone" }, researched: true, prep: { questions: 0, solid: 0 } };
    const c = itemCopy(item);
    expect(c.reason).toBe("Recruiter screen");
    expect(c.jobLine).toBe("Design Lead at Northwind Labs");
    expect(c.meta).toEqual({ prefix: "", time: { at, mode: "datetime" }, suffix: " · Phone" });
    expect(primaryAction(item)).toEqual({ type: "link", label: "Open prep", href: "/jobs/lead-at-northwind?tab=prep" });
  });

  it("interview without a format leaves the format out", () => {
    const item: AttentionItem = { kind: "interview", job, stage: { id: "s1", label: "Panel", scheduledAt: at, format: null }, researched: true, prep: { questions: 0, solid: 0 } };
    expect(itemCopy(item).meta.suffix).toBe("");
  });

  it("interview with no research says so and opens Research instead of Prep", () => {
    const item: AttentionItem = { kind: "interview", job, stage: { id: "s1", label: "Recruiter screen", scheduledAt: at, format: "phone" }, researched: false, prep: { questions: 0, solid: 0 } };
    expect(itemCopy(item).meta.suffix).toBe(" · Phone · No research yet");
    expect(primaryAction(item)).toEqual({ type: "link", label: "Open research", href: "/jobs/lead-at-northwind?tab=research" });
    const noFormat: AttentionItem = { ...item, stage: { ...item.stage, format: null } };
    expect(itemCopy(noFormat).meta.suffix).toBe(" · No research yet");
  });

  it("an interview with research and no question rows shows 'No prep yet' linking to the hub", () => {
    const item: AttentionItem = { kind: "interview", job, stage: { id: "s1", label: "Recruiter screen", scheduledAt: at, format: "phone" }, researched: true, prep: { questions: 0, solid: 0 } };
    expect(itemCopy(item).prepLine).toEqual({ text: "No prep yet", href: "/jobs/lead-at-northwind?tab=prep" });
  });

  it("an interview with research and 30 rows, 12 solid, shows '12 of 30 solid' without a link", () => {
    const item: AttentionItem = { kind: "interview", job, stage: { id: "s1", label: "Recruiter screen", scheduledAt: at, format: "phone" }, researched: true, prep: { questions: 30, solid: 12 } };
    expect(itemCopy(item).prepLine).toEqual({ text: "12 of 30 solid", href: null });
  });

  it("an interview with no research keeps 'No research yet' and shows no prep line", () => {
    const item: AttentionItem = { kind: "interview", job, stage: { id: "s1", label: "Recruiter screen", scheduledAt: at, format: "phone" }, researched: false, prep: { questions: 30, solid: 12 } };
    const c = itemCopy(item);
    expect(c.meta.suffix).toContain("No research yet");
    expect(c.prepLine).toBeNull();
  });

  it("the primary action is still 'Open prep' with href ?tab=prep", () => {
    const item: AttentionItem = { kind: "interview", job, stage: { id: "s1", label: "Recruiter screen", scheduledAt: at, format: "phone" }, researched: true, prep: { questions: 30, solid: 12 } };
    expect(primaryAction(item)).toEqual({ type: "link", label: "Open prep", href: "/jobs/lead-at-northwind?tab=prep" });
  });

  it("other attention kinds carry no prep line", () => {
    const items: AttentionItem[] = [
      { kind: "due", job, nextAction: "Send", at, overdue: false },
      { kind: "follow_up", job, quietDays: 9, appliedAt: at },
      { kind: "saved", job, days: 4, savedAt: at },
      { kind: "passed", job, stage: { id: "s1", label: "Panel", scheduledAt: at, format: null } },
    ];
    for (const item of items) expect(itemCopy(item).prepLine).toBeNull();
  });

  it("due, overdue and today", () => {
    const base = { kind: "due", job, nextAction: "Send portfolio link", at } as const;
    expect(itemCopy({ ...base, overdue: true }).meta.prefix).toBe("Overdue · ");
    const today = itemCopy({ ...base, overdue: false });
    expect(today.reason).toBe("Send portfolio link");
    expect(today.meta.prefix).toBe("Due today · ");
    expect(primaryAction({ ...base, overdue: false })).toEqual({ type: "mark_done", label: "Mark done" });
  });

  it("follow_up", () => {
    const item: AttentionItem = { kind: "follow_up", job, quietDays: 9, appliedAt: at };
    const c = itemCopy(item);
    expect(c.reason).toBe("Nothing new for 9 days");
    expect(c.meta).toEqual({ prefix: "In Applied since ", time: { at, mode: "date" }, suffix: ". No next action set." });
    expect(primaryAction(item)).toEqual({ type: "link", label: "Set next action", href: "/jobs/lead-at-northwind" });
  });

  it("saved", () => {
    const item: AttentionItem = { kind: "saved", job, days: 4, savedAt: at };
    const c = itemCopy(item);
    expect(c.reason).toBe("In Saved for 4 days");
    expect(c.meta).toEqual({ prefix: "Saved ", time: { at, mode: "date" }, suffix: "." });
    expect(primaryAction(item).label).toBe("Mark applied");
  });

  it("passed", () => {
    const item: AttentionItem = { kind: "passed", job, stage: { id: "s2", label: "Hiring manager", scheduledAt: at, format: null } };
    const c = itemCopy(item);
    expect(c.reason).toBe("Hiring manager");
    expect(c.meta).toEqual({ prefix: "Was ", time: { at, mode: "datetime" }, suffix: ". Still marked as scheduled." });
    expect(primaryAction(item)).toEqual({ type: "link", label: "Add notes", href: "/jobs/lead-at-northwind" });
  });
});

describe("misc copy", () => {
  it("group titles are in the plan's words", () => {
    expect(Object.values(GROUP_TITLES)).toEqual([
      "Interviews in the next 72 hours",
      "Due today or overdue",
      "Follow up?",
      "Apply or drop",
      "Mark it done and add notes",
    ]);
  });

  it("snoozedMessage names weekday, day and month", () => {
    expect(snoozedMessage(new Date(2026, 9, 16, 12))).toMatch(/^Snoozed to Fri .*16.*Oct.*\.$|^Snoozed to Fri 16 Oct\.$/);
  });
});
