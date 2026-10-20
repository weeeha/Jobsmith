import { describe, expect, it } from "vitest";
import { makeTestDb, createTestUser } from "../helpers/db";
import { scoped } from "@/lib/db/scoped";
import { seedOpportunity, stageIdsByKind } from "../helpers/opportunity-fixture";
import { moveOpportunity } from "@/lib/pipeline/move";
import { setNextAction } from "@/lib/pipeline/next-action";
import { scheduleStage } from "@/lib/pipeline/schedule";
import { closeOpportunity } from "@/lib/pipeline/close";
import { loadHome } from "@/lib/attention/load";
import { INTERVIEW_RESEARCH_KINDS } from "@/lib/attention/items";
import { snoozeItem } from "@/lib/attention/snooze";
import { expectOk, expectFail } from "../helpers/result";

const NOW = new Date("2026-10-15T15:00:00.000Z");
const DAY = 86_400_000;
const ago = (days: number) => new Date(NOW.getTime() - days * DAY);

describe("loadHome", () => {
  it("builds the attention list, column counts and recent pushes from the database", async () => {
    const { db, close } = await makeTestDb();
    try {
      const user = await createTestUser(db, "home-owner@example.com");
      const s = scoped(db, user.id);
      await s.profile.upsert({ timezone: "America/New_York" });

      const saved = await seedOpportunity(s, { companyName: "Acme Robotics", roleTitle: "Staff Product Designer" }, ago(5));
      const applied = await seedOpportunity(s, { companyName: "Northwind Labs", roleTitle: "Product Designer" }, ago(12));
      expectOk(await moveOpportunity(s, applied.id, { kind: "applied" }, ago(10)));
      const screening = await seedOpportunity(s, { companyName: "Lumen Health", roleTitle: "Design Lead" }, ago(3));
      expectOk(await moveOpportunity(s, screening.id, { kind: "recruiter_screen" }, ago(2)));
      const screenStage = (await stageIdsByKind(s, screening.id)).recruiter_screen;
      expectOk(await scheduleStage(s, screening.id, screenStage, { scheduledAt: new Date(NOW.getTime() + 20 * 3_600_000), format: "phone" }, ago(2)));
      expectOk(await setNextAction(s, screening.id, { text: "Send portfolio link", at: ago(1) }));

      const closed = await seedOpportunity(s, { companyName: "Acme Robotics", roleTitle: "Principal Designer" }, ago(9));
      expectOk(await closeOpportunity(s, closed.id, "withdrawn", ago(1)));

      const company = (await s.company.list()).find((c) => c.name === "Lumen Health")!;
      await s.artifact.insert({ opportunityId: null, companyId: company.id, stageId: null, key: "research", version: 1, kind: "research", title: "Lumen Health research", bodyMd: "# R", contentHash: "h1", sourceHash: "h1", origin: "pushed" });
      await s.artifact.insert({ opportunityId: screening.id, companyId: null, stageId: null, key: "call-card", version: 1, kind: "call_card", title: "Call card", bodyMd: "# C", contentHash: "h2", sourceHash: "h2", origin: "pushed" });
      await s.artifact.insert({ opportunityId: screening.id, companyId: null, stageId: null, key: "cv", version: 1, kind: "cv", title: "CV", bodyMd: "# CV", contentHash: "h3", sourceHash: "h3", origin: "pasted" });

      const home = await loadHome(s, NOW);
      expect(home.timeZone).toBe("America/New_York");
      expect(home.items.map((i) => `${i.kind}:${i.job.slug}`)).toEqual([
        `interview:${screening.slug}`,
        `due:${screening.slug}`,
        `follow_up:${applied.slug}`,
        `saved:${saved.slug}`,
      ]);
      expect(home.columns.map((c) => [c.title, c.count])).toEqual([
        ["Saved", 1], ["Applied", 1], ["Recruiter", 1], ["Hiring manager", 0], ["Portfolio / case", 0], ["Panel / final", 0], ["Offer", 0],
      ]);
      expect(home.pushes.map((p) => p.title).sort()).toEqual(["Call card", "Lumen Health research"]);
      const research = home.pushes.find((p) => p.title === "Lumen Health research")!;
      expect(research.job).toBeNull();
      expect(research.companyName).toBe("Lumen Health");
      expect(research.companyJobSlug).toBe(screening.slug);
      expect(research.key).toBe("research");
      const card = home.pushes.find((p) => p.title === "Call card")!;
      expect(card.job).toEqual({ slug: screening.slug, roleTitle: "Design Lead" });
      // Lumen Health's company-wide research covers the screening job.
      const interview = home.items.find((i) => i.kind === "interview");
      expect(interview?.kind === "interview" && interview.researched).toBe(true);
    } finally {
      await close();
    }
  });

  it("counts research and people notes, the job's own or its company's, and not a fit brief", async () => {
    const { db, close } = await makeTestDb();
    try {
      const user = await createTestUser(db, "research-owner@example.com");
      const s = scoped(db, user.id);
      const doc = (scope: { opportunityId: string } | { companyId: string }, kind: "research" | "people_notes" | "fit_brief") =>
        s.artifact.insert({
          opportunityId: null,
          companyId: null,
          ...scope,
          stageId: null,
          key: kind,
          version: 1,
          kind,
          title: kind,
          bodyMd: "# D",
          contentHash: kind,
          sourceHash: kind,
          origin: "pasted",
        });

      const ownNotes = await seedOpportunity(s, { companyName: "Northwind Labs" }, ago(5));
      const viaCompany = await seedOpportunity(s, { companyName: "Lumen Health", roleTitle: "Design Lead" }, ago(5));
      const sameCompany = await seedOpportunity(s, { companyName: "Lumen Health", roleTitle: "Staff Designer" }, ago(5));
      const fitOnly = await seedOpportunity(s, { companyName: "Acme Robotics" }, ago(5));
      const nothing = await seedOpportunity(s, { companyName: "Globex" }, ago(5));

      await doc({ opportunityId: ownNotes.id }, "people_notes");
      const lumen = (await s.company.list()).find((c) => c.name === "Lumen Health")!;
      await doc({ companyId: lumen.id }, "research");
      await doc({ opportunityId: fitOnly.id }, "fit_brief");

      const ids = await s.artifact.opportunityIdsWithKinds(INTERVIEW_RESEARCH_KINDS);
      expect(ids).toEqual(new Set([ownNotes.id, viaCompany.id, sameCompany.id]));
      expect(ids.has(fitOnly.id) || ids.has(nothing.id)).toBe(false);
    } finally {
      await close();
    }
  });
});

describe("snoozeItem", () => {
  it("sets the next action to 09:00 in the profile zone and uses the rule's default text", async () => {
    const { db, close } = await makeTestDb();
    try {
      const user = await createTestUser(db, "snooze-owner@example.com");
      const s = scoped(db, user.id);
      await s.profile.upsert({ timezone: "America/New_York" });
      const job = await seedOpportunity(s, {}, ago(5));

      const result = expectOk(await snoozeItem(s, { opportunityId: job.id, kind: "saved", days: 3, stageId: null }, NOW));
      expect(result.at.toISOString()).toBe("2026-10-18T13:00:00.000Z");
      const row = await s.opportunity.getById(job.id);
      expect(row?.nextAction).toBe("Apply or drop");
      expect(row?.nextActionAt?.toISOString()).toBe("2026-10-18T13:00:00.000Z");

      // A second snooze keeps the text that is now set.
      expectOk(await snoozeItem(s, { opportunityId: job.id, kind: "saved", days: 1, stageId: null }, NOW));
      expect((await s.opportunity.getById(job.id))?.nextAction).toBe("Apply or drop");
    } finally {
      await close();
    }
  });

  it("names the stage for a passed interview and refuses another user's job", async () => {
    const { db, close } = await makeTestDb();
    try {
      const alice = await createTestUser(db, "snooze-alice@example.com");
      const bob = await createTestUser(db, "snooze-bob@example.com");
      const a = scoped(db, alice.id);
      const job = await seedOpportunity(a, {}, ago(5));
      const stageId = (await stageIdsByKind(a, job.id)).hiring_manager;

      expectOk(await snoozeItem(a, { opportunityId: job.id, kind: "passed", days: 1, stageId }, NOW));
      expect((await a.opportunity.getById(job.id))?.nextAction).toBe("Add notes for Hiring manager");

      expectFail(await snoozeItem(scoped(db, bob.id), { opportunityId: job.id, kind: "passed", days: 1, stageId }, NOW), "not_found");
    } finally {
      await close();
    }
  });
});
