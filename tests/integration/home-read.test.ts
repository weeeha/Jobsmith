import { describe, expect, it } from "vitest";
import { getHomeView, RECENT_PUSHES_LIMIT } from "@/lib/home/read";
import { scoped, type Scoped } from "@/lib/db/scoped";
import { closeOpportunity } from "@/lib/pipeline/close";
import { createOpportunity } from "@/lib/pipeline/create";
import type { StageKind } from "@/lib/pipeline/kinds";
import { ATTENTION_NOW } from "../helpers/attention";
import { createTestUser, makeTestDb } from "../helpers/db";
import { seedProfile } from "../helpers/profile";

const CREATED = new Date("2026-10-01T09:00:00.000Z");

// Creates a job at `created`, then moves it to `kind` the way the pipeline
// would have left it: that stage current, with its entry time set.
async function job(s: Scoped, company: string, role: string, kind: StageKind = "saved", enteredAt: Date = CREATED) {
  const created = await createOpportunity(s, { companyName: company, roleTitle: role }, CREATED);
  if (!created.ok) throw new Error(created.message);
  const stages = await s.stage.listForOpportunity(created.data.id);
  const stage = stages.find((entry) => entry.kind === kind);
  if (!stage) throw new Error(`no ${kind} stage`);
  await s.stage.update(stage.id, { enteredAt });
  await s.opportunity.update(created.data.id, { currentStageId: stage.id });
  return { ...created.data, stageId: stage.id };
}

async function setup(timezone = "Europe/Amsterdam") {
  const { db, close } = await makeTestDb();
  const user = await createTestUser(db, "owner@example.com");
  const s = scoped(db, user.id);
  await seedProfile(s, { timezone, preferences: { attention: { followUpDays: 7, savedDays: 3 } } });
  return { db, close, s };
}

describe("getHomeView", () => {
  it("assembles the items, the counts and the recent pushes", async () => {
    const { s, close } = await setup();
    try {
      const saved = await job(s, "Northwind Traders", "Product Designer");
      const applied = await job(s, "Acme Robotics", "Design Lead", "applied", new Date("2026-10-02T09:00:00.000Z"));
      await s.event.insert({ opportunityId: applied.id, kind: "note", body: "Sent a note", occurredAt: new Date("2026-10-03T09:00:00.000Z") });
      const screening = await job(s, "Lumen Health", "UX Researcher", "recruiter_screen", new Date("2026-10-09T09:00:00.000Z"));
      await s.stage.update(screening.stageId, { status: "scheduled", scheduledAt: new Date("2026-10-13T09:00:00.000Z") });
      await s.opportunity.update(screening.id, { nextAction: "Send portfolio", nextActionAt: new Date("2026-10-11T21:45:00.000Z") });
      const past = await job(s, "Northwind Traders", "Design Manager", "hiring_manager", new Date("2026-10-05T09:00:00.000Z"));
      await s.stage.update(past.stageId, { status: "scheduled", scheduledAt: new Date("2026-10-10T09:00:00.000Z") });
      const closed = await job(s, "Acme Robotics", "Intern", "applied", new Date("2026-09-01T09:00:00.000Z"));
      await closeOpportunity(s, closed.id, "rejected", ATTENTION_NOW);

      // On the closed job: a push on the saved job would count as activity
      // there and push its Apply or drop reminder back.
      for (let i = 0; i < RECENT_PUSHES_LIMIT + 1; i++) {
        await s.event.insert({
          opportunityId: closed.id,
          kind: "artifact_pushed",
          occurredAt: new Date(Date.UTC(2026, 9, 5 + i, 10)),
          meta: { items: Array.from({ length: i === 5 ? 2 : 1 }, (_, n) => ({ key: `doc-${n}`, scope: "opportunity", status: "created", version: 1 })) },
        });
      }

      const view = await getHomeView(s, ATTENTION_NOW);

      expect(view.hasActiveJobs).toBe(true);
      expect(view.items.map((item) => [item.rule, item.slug])).toEqual([
        ["interview_soon", screening.slug],
        ["next_action_due", screening.slug],
        ["follow_up", applied.slug],
        ["apply_or_drop", saved.slug],
        ["mark_done", past.slug],
      ]);
      expect(view.counts).toEqual([
        { kind: "saved", label: "Saved", count: 1 },
        { kind: "applied", label: "Applied", count: 1 },
        { kind: "recruiter_screen", label: "Recruiter", count: 1 },
        { kind: "hiring_manager", label: "Hiring manager", count: 1 },
        { kind: "portfolio_case", label: "Portfolio / case", count: 0 },
        { kind: "panel_final", label: "Panel / final", count: 0 },
        { kind: "offer", label: "Offer", count: 0 },
      ]);
      expect(view.pushes).toHaveLength(RECENT_PUSHES_LIMIT);
      expect(view.pushes[0]).toMatchObject({ slug: closed.slug, roleTitle: "Intern", companyName: "Acme Robotics", documents: 2 });
      expect(view.pushes[0]?.occurredAt).toEqual(new Date("2026-10-10T10:00:00.000Z"));
      expect(view.pushes.map((push) => push.documents)).toEqual([2, 1, 1, 1, 1]);
    } finally {
      await close();
    }
  });

  it("reads 'today' in the profile zone", async () => {
    const amsterdam = await setup("Europe/Amsterdam");
    const newYork = await setup("America/New_York");
    try {
      for (const { s } of [amsterdam, newYork]) {
        const due = await job(s, "Acme Robotics", "Product Designer", "recruiter_screen", ATTENTION_NOW);
        await s.opportunity.update(due.id, { nextAction: "Prep", nextActionAt: new Date("2026-10-11T22:30:00.000Z") });
      }
      expect((await getHomeView(amsterdam.s, ATTENTION_NOW)).items).toEqual([]);
      expect((await getHomeView(newYork.s, ATTENTION_NOW)).items.map((item) => item.rule)).toEqual(["next_action_due"]);
    } finally {
      await amsterdam.close();
      await newYork.close();
    }
  });

  it("uses the reminder days from the saved preferences", async () => {
    const { s, close } = await setup();
    try {
      await seedProfile(s, { timezone: "Europe/Amsterdam", preferences: { attention: { followUpDays: 10, savedDays: 20 } } });
      await job(s, "Northwind Traders", "Product Designer");
      expect((await getHomeView(s, ATTENTION_NOW)).items).toEqual([]);
    } finally {
      await close();
    }
  });

  it("counts a push with no items list as zero documents", async () => {
    const { s, close } = await setup();
    try {
      const saved = await job(s, "Northwind Traders", "Product Designer", "saved", ATTENTION_NOW);
      await s.event.insert({ opportunityId: saved.id, kind: "artifact_pushed", occurredAt: CREATED, meta: {} });
      expect((await getHomeView(s, ATTENTION_NOW)).pushes.map((push) => push.documents)).toEqual([0]);
    } finally {
      await close();
    }
  });

  it("is empty, with seven zero counts, for a user with no jobs and no profile row", async () => {
    const { db, close } = await makeTestDb();
    try {
      const s = scoped(db, (await createTestUser(db, "empty@example.com")).id);
      const view = await getHomeView(s, ATTENTION_NOW);
      expect(view.hasActiveJobs).toBe(false);
      expect(view.items).toEqual([]);
      expect(view.pushes).toEqual([]);
      expect(view.counts).toHaveLength(7);
      expect(view.counts.every((count) => count.count === 0)).toBe(true);
    } finally {
      await close();
    }
  });

  it("does not count or list a closed job", async () => {
    const { s, close } = await setup();
    try {
      const only = await job(s, "Acme Robotics", "Intern");
      await closeOpportunity(s, only.id, "withdrawn", ATTENTION_NOW);
      const view = await getHomeView(s, ATTENTION_NOW);
      expect(view.hasActiveJobs).toBe(false);
      expect(view.items).toEqual([]);
    } finally {
      await close();
    }
  });
});
