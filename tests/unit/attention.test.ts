import { describe, expect, it } from "vitest";
import {
  ATTENTION_RULES,
  INTERVIEW_WINDOW_MS,
  SNOOZABLE_RULES,
  attentionItems,
  type AttentionInput,
} from "@/lib/attention";
import type { AttentionOpportunity, AttentionStage } from "@/lib/attention/types";
import { ATTENTION_NOW, attentionOpp } from "../helpers/attention";

const SETTINGS = { followUpDays: 7, savedDays: 3 };

function input(
  opportunities: AttentionOpportunity[],
  scheduledStages: AttentionStage[] = [],
  over: Partial<AttentionInput> = {},
): AttentionInput {
  return { opportunities, scheduledStages, now: ATTENTION_NOW, timeZone: "Europe/Amsterdam", settings: SETTINGS, ...over };
}

const keys = (i: AttentionInput) => attentionItems(i).map((item) => item.key);

// The scenario from the planning spike: every rule at once, in Amsterdam.
const SCENARIO = input(
  [
    attentionOpp("due-late-today", { nextAction: "Send portfolio", nextActionAt: new Date("2026-10-11T21:45:00.000Z") }),
    attentionOpp("overdue", { nextAction: "Email Priya", nextActionAt: new Date("2026-10-09T08:00:00.000Z") }),
    attentionOpp("due-tomorrow", { nextAction: "Prep", nextActionAt: new Date("2026-10-11T22:30:00.000Z") }),
    attentionOpp("applied-quiet", { stageKind: "applied", lastEventAt: new Date("2026-10-04T12:00:00.000Z") }),
    attentionOpp("applied-recent", { stageKind: "applied", lastEventAt: new Date("2026-10-05T12:00:00.000Z") }),
    attentionOpp("saved-old", { stageEnteredAt: new Date("2026-10-08T07:00:00.000Z") }),
    attentionOpp("saved-old-with-action", { stageEnteredAt: new Date("2026-10-01T07:00:00.000Z"), nextAction: "Decide", nextActionAt: null }),
    attentionOpp("interviewing", { stageKind: "recruiter_screen" }),
  ],
  [
    { id: "s-soon", opportunityId: "interviewing", label: "Recruiter screen", scheduledAt: new Date("2026-10-13T09:00:00.000Z") },
    { id: "s-far", opportunityId: "interviewing", label: "Panel", scheduledAt: new Date("2026-10-20T09:00:00.000Z") },
    { id: "s-past", opportunityId: "interviewing", label: "Hiring manager", scheduledAt: new Date("2026-10-10T09:00:00.000Z") },
  ],
);

describe("attentionItems: the whole scenario", () => {
  it("lists the rules in order, and within a rule by time", () => {
    expect(keys(SCENARIO)).toEqual([
      "interview_soon:s-soon",
      "next_action_due:overdue",
      "next_action_due:due-late-today",
      "follow_up:applied-quiet",
      "apply_or_drop:saved-old",
      "mark_done:s-past",
    ]);
  });

  it("moves 'today' with the profile zone: a next action due at 22:30Z is tomorrow in Amsterdam and today in New York", () => {
    expect(keys(SCENARIO)).not.toContain("next_action_due:due-tomorrow");
    expect(keys({ ...SCENARIO, timeZone: "America/New_York" })).toContain("next_action_due:due-tomorrow");
  });

  it("carries the job, the time, the stage and the day count on each item", () => {
    const items = attentionItems(SCENARIO);
    expect(items[0]).toEqual({
      key: "interview_soon:s-soon",
      rule: "interview_soon",
      opportunityId: "interviewing",
      slug: "interviewing",
      roleTitle: "Product Designer",
      companyName: "Acme Robotics",
      at: new Date("2026-10-13T09:00:00.000Z"),
      stage: { id: "s-soon", label: "Recruiter screen" },
      nextAction: null,
      days: null,
      overdue: false,
      snoozable: false,
    });
    expect(items[1]).toMatchObject({ rule: "next_action_due", nextAction: "Email Priya", stage: null, days: null });
    expect(items[3]).toMatchObject({ rule: "follow_up", at: new Date("2026-10-04T12:00:00.000Z"), days: 7 });
    expect(items[4]).toMatchObject({ rule: "apply_or_drop", at: new Date("2026-10-08T07:00:00.000Z"), days: 3 });
  });
});

describe("rule 1: interviews in the next 72 hours", () => {
  const stageAt = (iso: string): AttentionStage => ({ id: "s1", opportunityId: "j", label: "Panel", scheduledAt: new Date(iso) });
  const withStage = (iso: string) => keys(input([attentionOpp("j", { stageKind: "panel_final" })], [stageAt(iso)]));

  it("includes both ends of [now, now + 72 hours]", () => {
    expect(withStage(ATTENTION_NOW.toISOString())).toEqual(["interview_soon:s1"]);
    expect(withStage(new Date(ATTENTION_NOW.getTime() + INTERVIEW_WINDOW_MS).toISOString())).toEqual(["interview_soon:s1"]);
  });

  it("leaves out one millisecond past the window", () => {
    expect(withStage(new Date(ATTENTION_NOW.getTime() + INTERVIEW_WINDOW_MS + 1).toISOString())).toEqual([]);
  });

  it("turns a stage one millisecond in the past into a mark-done item instead", () => {
    expect(withStage(new Date(ATTENTION_NOW.getTime() - 1).toISOString())).toEqual(["mark_done:s1"]);
  });

  it("ignores a stage whose job is not in the list", () => {
    expect(keys(input([], [stageAt("2026-10-12T09:00:00.000Z")]))).toEqual([]);
  });

  it("never offers a snooze for interviews or mark-done items", () => {
    const items = attentionItems(SCENARIO);
    expect(items.filter((item) => item.rule === "interview_soon" || item.rule === "mark_done").every((item) => !item.snoozable)).toBe(true);
  });
});

describe("rule 2: next actions that are due", () => {
  const due = (iso: string, zone = "Europe/Amsterdam") =>
    keys(input([attentionOpp("j", { nextAction: "Send portfolio", nextActionAt: new Date(iso) })], [], { timeZone: zone }));

  it("counts everything before the start of tomorrow in the profile zone", () => {
    // Amsterdam's tomorrow starts at 22:00Z on 2026-10-11.
    expect(due("2026-10-11T21:59:59.999Z")).toEqual(["next_action_due:j"]);
    expect(due("2026-10-11T22:00:00.000Z")).toEqual([]);
  });

  it("uses the profile zone's day, not UTC's", () => {
    // 2026-10-11T23:30Z is still the 11th in UTC and New York, already the 12th in Amsterdam.
    expect(due("2026-10-11T23:30:00.000Z", "America/New_York")).toEqual(["next_action_due:j"]);
    expect(due("2026-10-11T23:30:00.000Z", "Europe/Amsterdam")).toEqual([]);
  });

  it("marks only items before the start of today as overdue", () => {
    const flags = (iso: string) => attentionItems(input([attentionOpp("j", { nextAction: "x", nextActionAt: new Date(iso) })]))[0]?.overdue;
    // Amsterdam's today started at 22:00Z on 2026-10-10.
    expect(flags("2026-10-10T21:59:59.999Z")).toBe(true);
    expect(flags("2026-10-10T22:00:00.000Z")).toBe(false);
    expect(flags("2026-10-11T08:00:00.000Z")).toBe(false);
  });

  it("is overdue only for this rule", () => {
    expect(attentionItems(SCENARIO).filter((item) => item.overdue).map((item) => item.key)).toEqual(["next_action_due:overdue"]);
  });

  it("is snoozable", () => {
    expect(attentionItems(SCENARIO).find((item) => item.rule === "next_action_due")?.snoozable).toBe(true);
  });

  it("does not list a next action that is due later", () => {
    expect(due("2026-10-20T09:00:00.000Z")).toEqual([]);
  });

  it("does not list an undated next action under any rule", () => {
    const undated = [
      attentionOpp("a", { nextAction: "Think about it", nextActionAt: null }),
      attentionOpp("b", { stageKind: "applied", lastEventAt: new Date("2026-09-01T00:00:00.000Z"), nextAction: "Wait", nextActionAt: null }),
      attentionOpp("c", { stageEnteredAt: new Date("2026-09-01T00:00:00.000Z"), nextAction: "Decide", nextActionAt: null }),
    ];
    expect(keys(input(undated))).toEqual([]);
  });

  it("sorts by time, then by key", () => {
    const at = new Date("2026-10-11T08:00:00.000Z");
    const list = [
      attentionOpp("b", { nextAction: "x", nextActionAt: at }),
      attentionOpp("c", { nextAction: "x", nextActionAt: new Date("2026-10-10T08:00:00.000Z") }),
      attentionOpp("a", { nextAction: "x", nextActionAt: at }),
    ];
    expect(keys(input(list))).toEqual(["next_action_due:c", "next_action_due:a", "next_action_due:b"]);
  });
});

describe("rules 3 and 4: quiet jobs", () => {
  const applied = (lastEventAt: string | null, over: Partial<AttentionOpportunity> = {}) =>
    attentionOpp("j", { stageKind: "applied", lastEventAt: lastEventAt === null ? null : new Date(lastEventAt), ...over });

  it("follows up on an applied job after followUpDays calendar days in the profile zone", () => {
    // Now is the 11th in Amsterdam; the 4th is seven calendar days back.
    expect(keys(input([applied("2026-10-04T05:00:00.000Z")]))).toEqual(["follow_up:j"]);
    expect(keys(input([applied("2026-10-05T05:00:00.000Z")]))).toEqual([]);
  });

  it("counts days by calendar date, not by 24 hour blocks", () => {
    // 2026-10-04T22:30Z is already the 5th in Amsterdam: only six days.
    expect(keys(input([applied("2026-10-04T22:30:00.000Z")]))).toEqual([]);
    // The same instant is still the 4th in New York: seven days.
    expect(keys(input([applied("2026-10-04T22:30:00.000Z")], [], { timeZone: "America/New_York" }))).toEqual(["follow_up:j"]);
  });

  it("falls back from the last event to the time the stage was entered, then to creation", () => {
    const old = new Date("2026-09-01T00:00:00.000Z");
    expect(keys(input([applied(null, { stageEnteredAt: old, createdAt: ATTENTION_NOW })]))).toEqual(["follow_up:j"]);
    expect(keys(input([applied(null, { stageEnteredAt: null, createdAt: old })]))).toEqual(["follow_up:j"]);
    expect(keys(input([applied(null, { stageEnteredAt: ATTENTION_NOW, createdAt: old })]))).toEqual([]);
  });

  it("honors a different followUpDays", () => {
    expect(keys(input([applied("2026-10-08T05:00:00.000Z")], [], { settings: { followUpDays: 3, savedDays: 3 } }))).toEqual(["follow_up:j"]);
    expect(keys(input([applied("2026-10-08T05:00:00.000Z")], [], { settings: { followUpDays: 4, savedDays: 3 } }))).toEqual([]);
  });

  it("asks to apply or drop a saved job after savedDays, counted from entering the stage", () => {
    const saved = (entered: string, over: Partial<AttentionOpportunity> = {}) => attentionOpp("j", { stageEnteredAt: new Date(entered), ...over });
    expect(keys(input([saved("2026-10-08T07:00:00.000Z")]))).toEqual(["apply_or_drop:j"]);
    expect(keys(input([saved("2026-10-09T07:00:00.000Z")]))).toEqual([]);
    // Recent events do not reset a saved job's clock.
    expect(keys(input([saved("2026-10-08T07:00:00.000Z", { lastEventAt: ATTENTION_NOW })]))).toEqual(["apply_or_drop:j"]);
  });

  it("honors a different savedDays and falls back to creation", () => {
    expect(keys(input([attentionOpp("j", { stageEnteredAt: null, createdAt: new Date("2026-10-08T07:00:00.000Z") })], [], { settings: { followUpDays: 7, savedDays: 4 } }))).toEqual([]);
    expect(keys(input([attentionOpp("j", { stageEnteredAt: null, createdAt: new Date("2026-10-07T07:00:00.000Z") })], [], { settings: { followUpDays: 7, savedDays: 4 } }))).toEqual(["apply_or_drop:j"]);
  });

  it("lists neither rule for a job with a dated next action in the future", () => {
    const quiet = applied("2026-09-01T00:00:00.000Z", { nextAction: "Call", nextActionAt: new Date("2026-10-30T09:00:00.000Z") });
    expect(keys(input([quiet]))).toEqual([]);
  });

  it("lists neither rule for a job further along than applied", () => {
    expect(keys(input([attentionOpp("j", { stageKind: "hiring_manager", lastEventAt: new Date("2026-09-01T00:00:00.000Z") })]))).toEqual([]);
  });

  it("shows a job under a stage rule and a next-action rule at the same time", () => {
    const list = [attentionOpp("j", { stageKind: "recruiter_screen", nextAction: "Send portfolio", nextActionAt: new Date("2026-10-11T21:45:00.000Z") })];
    const stages = [{ id: "s1", opportunityId: "j", label: "Recruiter screen", scheduledAt: new Date("2026-10-12T09:00:00.000Z") }];
    expect(keys(input(list, stages))).toEqual(["interview_soon:s1", "next_action_due:j"]);
  });

  it("marks follow-ups and apply-or-drop items snoozable", () => {
    const items = attentionItems(SCENARIO).filter((item) => item.rule === "follow_up" || item.rule === "apply_or_drop");
    expect(items).toHaveLength(2);
    expect(items.every((item) => item.snoozable)).toBe(true);
  });
});

describe("rule constants", () => {
  it("names the rules in spec order and the three that can be snoozed", () => {
    expect(ATTENTION_RULES).toEqual(["interview_soon", "next_action_due", "follow_up", "apply_or_drop", "mark_done"]);
    expect(SNOOZABLE_RULES).toEqual(["next_action_due", "follow_up", "apply_or_drop"]);
    expect(INTERVIEW_WINDOW_MS).toBe(72 * 60 * 60 * 1000);
  });
});
