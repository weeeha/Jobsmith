import { describe, expect, it } from "vitest";
import { attentionItems, type AttentionInput, type AttentionJob } from "@/lib/attention/items";

const NOW = new Date("2026-10-15T15:00:00.000Z"); // Thu 15 Oct, 11:00 in New York
const DAY = 86_400_000;
const ago = (days: number) => new Date(NOW.getTime() - days * DAY);
const ahead = (hours: number) => new Date(NOW.getTime() + hours * 3_600_000);

function job(id: string, overrides: Partial<AttentionJob> = {}): AttentionJob {
  return {
    id,
    slug: `job-${id}`,
    roleTitle: `Role ${id}`,
    companyName: "Acme Robotics",
    nextAction: null,
    nextActionAt: null,
    stage: { kind: "applied", label: "Applied", enteredAt: ago(1) },
    lastEventAt: ago(1),
    researched: true,
    ...overrides,
  };
}

function input(overrides: Partial<AttentionInput>): AttentionInput {
  return { now: NOW, timeZone: "America/New_York", followUpDays: 7, savedDays: 3, jobs: [], scheduled: [], ...overrides };
}

describe("attentionItems", () => {
  it("lists interviews from now to 72 hours ahead, soonest first, and nothing past that", () => {
    const items = attentionItems(
      input({
        jobs: [job("a"), job("b"), job("c")],
        scheduled: [
          { id: "s1", opportunityId: "b", kind: "hiring_manager", label: "Hiring manager", scheduledAt: ahead(48), format: "video" },
          { id: "s2", opportunityId: "a", kind: "recruiter_screen", label: "Recruiter screen", scheduledAt: ahead(2), format: "phone" },
          { id: "s3", opportunityId: "c", kind: "panel_final", label: "Panel", scheduledAt: ahead(73), format: null },
        ],
      }),
    );
    expect(items.filter((i) => i.kind === "interview").map((i) => i.job.id)).toEqual(["a", "b"]);
  });

  it("carries whether each interviewing job has research", () => {
    const items = attentionItems(
      input({
        jobs: [job("a", { researched: false }), job("b")],
        scheduled: [
          { id: "s1", opportunityId: "a", kind: "recruiter_screen", label: "Recruiter screen", scheduledAt: ahead(2), format: "phone" },
          { id: "s2", opportunityId: "b", kind: "hiring_manager", label: "Hiring manager", scheduledAt: ahead(24), format: "video" },
        ],
      }),
    );
    expect(items.map((i) => (i.kind === "interview" ? [i.job.id, i.researched] : null))).toEqual([
      ["a", false],
      ["b", true],
    ]);
  });

  it("counts a next action as due until the end of today in the profile zone, oldest first", () => {
    // 23:00 in New York is 03:00 UTC the next day: still today there.
    const lateTonight = new Date("2026-10-16T03:00:00.000Z");
    const tomorrowMorning = new Date("2026-10-16T13:00:00.000Z");
    const items = attentionItems(
      input({
        jobs: [
          job("tonight", { nextAction: "Send portfolio link", nextActionAt: lateTonight }),
          job("late", { nextAction: "Prepare outline", nextActionAt: ago(2) }),
          job("tomorrow", { nextAction: "Call back", nextActionAt: tomorrowMorning }),
          job("undated", { nextAction: "Someday" }),
        ],
      }),
    );
    const due = items.filter((i) => i.kind === "due");
    expect(due.map((i) => i.job.id)).toEqual(["late", "tonight"]);
    expect(due.map((i) => (i.kind === "due" ? i.overdue : null))).toEqual([true, false]);
  });

  it("asks for a follow-up only in Applied, with no next action, after the quiet period", () => {
    const items = attentionItems(
      input({
        jobs: [
          job("quiet", { lastEventAt: ago(9) }),
          job("recent", { lastEventAt: ago(2) }),
          job("planned", { lastEventAt: ago(9), nextAction: "Email the recruiter", nextActionAt: ahead(30) }),
          job("screening", { lastEventAt: ago(9), stage: { kind: "recruiter_screen", label: "Recruiter screen", enteredAt: ago(9) } }),
        ],
      }),
    );
    const follow = items.filter((i) => i.kind === "follow_up");
    expect(follow.map((i) => i.job.id)).toEqual(["quiet"]);
    expect(follow[0].kind === "follow_up" && follow[0].quietDays).toBe(9);
  });

  it("asks to apply or drop a job sitting in Saved, unless it is snoozed", () => {
    const saved = (days: number) => ({ kind: "saved" as const, label: "Saved", enteredAt: ago(days) });
    const items = attentionItems(
      input({
        jobs: [
          job("old", { stage: saved(4) }),
          job("new", { stage: saved(1) }),
          job("snoozed", { stage: saved(6), nextAction: "Apply or drop", nextActionAt: ahead(20) }),
          job("older", { stage: saved(10) }),
        ],
      }),
    );
    expect(items.filter((i) => i.kind === "saved").map((i) => i.job.id)).toEqual(["older", "old"]);
  });

  it("flags a scheduled stage whose time has passed, unless the job is snoozed", () => {
    const items = attentionItems(
      input({
        jobs: [job("a"), job("b", { nextAction: "Add notes for Panel", nextActionAt: ahead(10) })],
        scheduled: [
          { id: "s1", opportunityId: "a", kind: "hiring_manager", label: "Hiring manager", scheduledAt: ago(2), format: null },
          { id: "s2", opportunityId: "b", kind: "panel_final", label: "Panel", scheduledAt: ago(1), format: null },
        ],
      }),
    );
    expect(items.filter((i) => i.kind === "passed").map((i) => i.job.id)).toEqual(["a"]);
  });

  it("keeps the spec's order across kinds, and a job can appear under two rules", () => {
    const items = attentionItems(
      input({
        jobs: [
          job("a", { nextAction: "Send notes", nextActionAt: ago(1) }),
          job("b", { stage: { kind: "saved", label: "Saved", enteredAt: ago(5) } }),
          job("c", { lastEventAt: ago(8) }),
        ],
        scheduled: [
          { id: "s1", opportunityId: "a", kind: "recruiter_screen", label: "Recruiter screen", scheduledAt: ahead(5), format: null },
          { id: "s2", opportunityId: "c", kind: "hiring_manager", label: "Hiring manager", scheduledAt: ago(3), format: null },
        ],
      }),
    );
    expect(items.map((i) => `${i.kind}:${i.job.id}`)).toEqual(["interview:a", "due:a", "follow_up:c", "saved:b", "passed:c"]);
  });

  it("ignores a scheduled stage of a job it was not given", () => {
    const items = attentionItems(
      input({
        scheduled: [{ id: "s1", opportunityId: "gone", kind: "panel_final", label: "Panel", scheduledAt: ahead(1), format: null }],
      }),
    );
    expect(items).toEqual([]);
  });
});
