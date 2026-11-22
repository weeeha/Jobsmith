import { describe, expect, it } from "vitest";
import { buildJobJson } from "@/lib/bridge/job-json";
import type { JobView } from "@/lib/pipeline/read";
import type { OpportunityRow, CompanyRow, StageRow, LinkedPerson, PersonRow } from "@/lib/db/scoped";
import { FIT_VERSION } from "@/lib/fit/stored";

const T = new Date("2026-09-01T00:00:00.000Z");
const generatedAt = new Date("2026-11-21T12:00:00.000Z");

const company = {
  id: "c1", userId: "u1", name: "Northwind Traders", nameKey: "northwind-traders", domain: "northwind.test",
  careersUrl: null, atsKind: null, atsOrg: null, size: "200", industry: "Logistics", hq: "Montreal",
  notesMd: "private note", tracked: false, createdAt: T, updatedAt: T,
} as CompanyRow;

const saved = {
  id: "s0", userId: "u1", opportunityId: "o1", kind: "saved", label: "Saved", position: 0, status: "done",
  scheduledAt: null, format: null, enteredAt: T, completedAt: new Date("2026-09-02T10:00:00.000Z"), outcomeMd: null,
  createdAt: T, updatedAt: T,
} as StageRow;
const screen = {
  ...saved, id: "s1", kind: "recruiter_screen", label: "Recruiter screen", position: 1, status: "scheduled",
  scheduledAt: new Date("2026-09-10T15:00:00.000Z"), completedAt: null, format: "video",
} as StageRow;

const person = {
  id: "p1", userId: "u1", companyId: "c1", name: "Priya Raman", title: "Recruiter",
  linkedinUrl: "https://linkedin.com/in/priya", email: "priya@example-mail.test", notesMd: "n", createdAt: T, updatedAt: T,
} as PersonRow;

function opportunity(partial: Partial<OpportunityRow> = {}): OpportunityRow {
  return {
    id: "o1", userId: "u1", companyId: "c1", slug: "northwind-designer", roleTitle: "Product Designer",
    location: "Montreal", workMode: "hybrid", source: "url", sourceUrl: "https://northwind.test/jobs/1",
    postingMd: "SECRET POSTING BODY", postingCapturedAt: new Date("2026-09-01T09:00:00.000Z"),
    compMin: null, compMax: null, compCurrency: null, compNote: null, myAsk: null, fitScore: null, fit: null,
    fitStatus: "none", needsReview: false, currentStageId: "s1", status: "active", closedReason: null, closedAt: null,
    closedStageId: null, nextAction: "Reply to Priya", nextActionAt: new Date("2026-09-05T00:00:00.000Z"),
    dedupeHash: null, createdAt: T, updatedAt: T, ...partial,
  } as OpportunityRow;
}

function view(o: OpportunityRow): JobView {
  const link: LinkedPerson = { linkId: "l1", role: "recruiter", stageId: "s1", person };
  const loose: LinkedPerson = { linkId: "l2", role: "other", stageId: null, person: { ...person, id: "p2", name: "Sam" } };
  return { opportunity: o, company, stages: [saved, screen], currentStage: screen, people: [link, loose], events: [], documents: [] };
}

const empty = {
  documents: [],
  prep: { questions: 0, solid: 0, okay: 0, shaky: 0, unmarked: 0 },
  requests: [],
  failedFilters: [] as string[],
  generatedAt,
};

describe("buildJobJson", () => {
  it("carries every field of the job/v1 shape in the spec's order, with schema job/v1", () => {
    const json = buildJobJson({ view: view(opportunity()), ...empty });
    expect(json.schema).toBe("job/v1");
    expect(Object.keys(json)).toEqual([
      "schema", "generated_at", "slug", "role", "company", "location", "work_mode", "status", "closed_reason",
      "source_url", "posting_captured_at", "current_stage", "stages", "people", "fit", "next_action",
      "next_action_at", "documents", "prep", "requests",
    ]);
    expect(json.company).toEqual({ name: "Northwind Traders", domain: "northwind.test", size: "200", industry: "Logistics", hq: "Montreal" });
    expect(json.current_stage).toEqual({ id: "s1", kind: "recruiter_screen", label: "Recruiter screen" });
    expect(json.stages.map((st) => st.position)).toEqual([0, 1]);
    expect(json.stages[1]).toEqual({
      id: "s1", position: 1, kind: "recruiter_screen", label: "Recruiter screen", status: "scheduled",
      scheduled_at: "2026-09-10T15:00:00.000Z", completed_at: null, format: "video",
    });
  });

  it("leaves person emails out", () => {
    const text = JSON.stringify(buildJobJson({ view: view(opportunity()), ...empty }));
    expect(text).not.toContain("example-mail.test");
    expect(text).not.toContain("email");
  });

  it("leaves the posting body out and keeps source_url and posting_captured_at", () => {
    const json = buildJobJson({ view: view(opportunity()), ...empty });
    expect(JSON.stringify(json)).not.toContain("SECRET POSTING BODY");
    expect(json.source_url).toBe("https://northwind.test/jobs/1");
    expect(json.posting_captured_at).toBe("2026-09-01T09:00:00.000Z");
  });

  it("fit is null when fit_status is none, and carries score, summary and failed_filters when done", () => {
    expect(buildJobJson({ view: view(opportunity()), ...empty }).fit).toBeNull();
    const stored = {
      v: FIT_VERSION, score: 72, summary: "Solid match.", pros: [], cons: [], modelId: "m", scoredAt: "2026-09-03T00:00:00.000Z",
    };
    const done = buildJobJson({
      view: view(opportunity({ fitStatus: "done", fit: stored })),
      ...empty,
      failedFilters: ["pay"],
    });
    expect(done.fit).toEqual({ status: "done", score: 72, summary: "Solid match.", failed_filters: ["pay"] });
    const pending = buildJobJson({ view: view(opportunity({ fitStatus: "pending" })), ...empty });
    expect(pending.fit).toEqual({ status: "pending", score: null, summary: null, failed_filters: [] });
  });

  it("stage on a person is the stage label or null", () => {
    const json = buildJobJson({ view: view(opportunity()), ...empty });
    expect(json.people.map((p) => p.stage)).toEqual(["Recruiter screen", null]);
    expect(json.people[0]).toEqual({
      name: "Priya Raman", title: "Recruiter", role: "recruiter", stage: "Recruiter screen", linkedin_url: "https://linkedin.com/in/priya",
    });
  });

  it("dates are ISO strings and null stays null", () => {
    const json = buildJobJson({ view: view(opportunity({ postingCapturedAt: null, nextActionAt: null, nextAction: null })), ...empty });
    expect(json.generated_at).toBe("2026-11-21T12:00:00.000Z");
    expect(json.posting_captured_at).toBeNull();
    expect(json.next_action).toBeNull();
    expect(json.next_action_at).toBeNull();
    expect(json.stages[0]!.scheduled_at).toBeNull();
    expect(json.stages[0]!.completed_at).toBe("2026-09-02T10:00:00.000Z");
  });
});
