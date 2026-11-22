import { describe, expect, it } from "vitest";
import { makeTestDb, createTestUser } from "../helpers/db";
import { bridgeFetch } from "../helpers/bridge-fetch";
import { scoped } from "@/lib/db/scoped";
import type { Db } from "@/lib/db/client";
import type { BridgeDeps } from "@/lib/bridge/handlers";
import { createApiToken } from "@/lib/auth/api-token";
import { defaultStages } from "@/lib/pipeline/rules";
import { listJobs } from "@/lib/mcp/tools/list-jobs";
import { getJob } from "@/lib/mcp/tools/get-job";
import { getJobContext } from "@/lib/mcp/tools/get-job-context";
import type { ToolContext } from "@/lib/mcp/registry";

const NOW = new Date("2026-11-21T12:00:00.000Z");

function depsFor(db: Db): BridgeDeps {
  let n = 0;
  return { db, now: () => NOW, revalidate: () => {}, requestId: () => `req-${++n}` };
}

async function seedJob(db: Db, userId: string, company: string, slug: string, role: string, extra: Record<string, unknown> = {}) {
  const s = scoped(db, userId);
  const c = await s.company.insert({ name: company, nameKey: `${company}-${slug}`.toLowerCase() });
  const opp = await s.opportunity.insert({ companyId: c.id, slug, roleTitle: role, postingMd: "BODY", ...extra });
  const stages = await s.stage.insertMany(
    defaultStages().map((d, i) => ({ opportunityId: opp.id, kind: d.kind, label: d.label, position: i })),
  );
  await s.opportunity.update(opp.id, { currentStageId: stages[0]!.id });
  return { opp, stages };
}

function ctxFor(db: Db, userId: string): ToolContext {
  return { s: scoped(db, userId), deps: depsFor(db), requestId: "req-t", now: NOW };
}

async function setup() {
  const { db, close } = await makeTestDb();
  const a = await createTestUser(db, "a@example.com");
  const b = await createTestUser(db, "b@example.com");
  return { db, close, a, b };
}

describe("mcp job read tools", () => {
  it("list_jobs returns the active jobs of the token's user with fit_score, next_action and updated_at, ordered as the bridge list", async () => {
    const { db, close, a } = await setup();
    try {
      await seedJob(db, a.id, "Zeta", "zeta-designer", "Designer");
      const { opp } = await seedJob(db, a.id, "Acme", "acme-lead", "Lead", { fitScore: 82, nextAction: "Email Sam" });
      await scoped(db, a.id).opportunity.update(opp.id, { nextActionAt: new Date("2026-11-25T00:00:00.000Z") });
      const out = await listJobs.handler(ctxFor(db, a.id), listJobs.input.parse({}));
      expect(out.ok).toBe(true);
      if (!out.ok) return;
      const jobs = (out.structured as { jobs: Record<string, unknown>[] }).jobs;
      expect(jobs.map((j) => j.slug)).toEqual(["acme-lead", "zeta-designer"]);
      expect(jobs[0]).toMatchObject({
        company: "Acme",
        role: "Lead",
        status: "active",
        fit_score: 82,
        next_action: "Email Sam",
        next_action_at: "2026-11-25T00:00:00.000Z",
      });
      expect(typeof jobs[0]!.updated_at).toBe("string");
      expect(jobs[1]).toMatchObject({ fit_score: null, next_action: null, next_action_at: null });
      expect(listJobs.output!.safeParse(out.structured).success).toBe(true);
    } finally {
      await close();
    }
  });

  it("list_jobs status closed and all, stage_kind filter and limit cut the list", async () => {
    const { db, close, a } = await setup();
    try {
      await seedJob(db, a.id, "Acme", "acme-lead", "Lead");
      const closed = await seedJob(db, a.id, "Beta", "beta-ic", "IC");
      await scoped(db, a.id).opportunity.update(closed.opp.id, { status: "closed", closedReason: "withdrawn", closedAt: NOW });
      const call = async (raw: object) => {
        const out = await listJobs.handler(ctxFor(db, a.id), listJobs.input.parse(raw));
        if (!out.ok) throw new Error("failed");
        return (out.structured as { jobs: { slug: string; stage: { kind: string } }[] }).jobs;
      };
      expect((await call({ status: "closed" })).map((j) => j.slug)).toEqual(["beta-ic"]);
      expect((await call({ status: "all" })).map((j) => j.slug)).toEqual(["acme-lead", "beta-ic"]);
      expect(await call({ status: "all", limit: 1 })).toHaveLength(1);
      const kind = (await call({}))[0]!.stage.kind;
      expect((await call({ status: "all", stage_kind: kind })).length).toBeGreaterThan(0);
      const other = defaultStages().map((d) => d.kind).find((k) => k !== kind);
      if (other) expect(await call({ status: "all", stage_kind: other })).toEqual([]);
    } finally {
      await close();
    }
  });

  it("list_jobs never returns another user's job", async () => {
    const { db, close, a, b } = await setup();
    try {
      await seedJob(db, a.id, "Acme", "acme-lead", "Lead");
      await seedJob(db, b.id, "Beta", "beta-ic", "IC");
      const out = await listJobs.handler(ctxFor(db, a.id), listJobs.input.parse({ status: "all" }));
      if (!out.ok) throw new Error("failed");
      expect((out.structured as { jobs: { slug: string }[] }).jobs.map((j) => j.slug)).toEqual(["acme-lead"]);
    } finally {
      await close();
    }
  });

  it("list_jobs input schema rejects limit 0 and 201", () => {
    expect(listJobs.input.safeParse({ limit: 0 }).success).toBe(false);
    expect(listJobs.input.safeParse({ limit: 201 }).success).toBe(false);
    expect(listJobs.input.safeParse({ limit: 200 }).success).toBe(true);
    expect(listJobs.input.safeParse({ status: "bogus" }).success).toBe(false);
  });

  it("get_job returns job/v1 for a slug and not_found with 'No job with the slug <slug>.' for another user's slug", async () => {
    const { db, close, a, b } = await setup();
    try {
      await seedJob(db, a.id, "Acme", "acme-lead", "Lead");
      await seedJob(db, b.id, "Beta", "beta-ic", "IC");
      const ok = await getJob.handler(ctxFor(db, a.id), getJob.input.parse({ slug: "acme-lead" }));
      expect(ok.ok).toBe(true);
      if (ok.ok) expect(ok.structured).toMatchObject({ schema: "job/v1", slug: "acme-lead", role: "Lead", generated_at: NOW.toISOString() });
      const miss = await getJob.handler(ctxFor(db, a.id), getJob.input.parse({ slug: "beta-ic" }));
      expect(miss).toEqual({ ok: false, code: "not_found", message: "No job with the slug beta-ic." });
      expect(getJob.input.safeParse({ slug: "a/b" }).success).toBe(false);
    } finally {
      await close();
    }
  });

  it("get_job_context returns the context/v1 markdown as text plus one resource_link", async () => {
    const { db, close, a, b } = await setup();
    try {
      await seedJob(db, a.id, "Acme", "acme-lead", "Lead");
      await seedJob(db, b.id, "Beta", "beta-ic", "IC");
      const out = await getJobContext.handler(ctxFor(db, a.id), getJobContext.input.parse({ slug: "acme-lead" }));
      expect(out.ok).toBe(true);
      if (!out.ok) return;
      expect(out.text).toContain("context/v1");
      expect(out.links).toEqual([{ uri: "jobsmith://jobs/acme-lead/context", name: "acme-lead context", mimeType: "text/markdown" }]);
      const miss = await getJobContext.handler(ctxFor(db, a.id), getJobContext.input.parse({ slug: "beta-ic" }));
      expect(miss).toEqual({ ok: false, code: "not_found", message: "No job with the slug beta-ic." });
    } finally {
      await close();
    }
  });

  it("get_job_context text equals the body of GET /context for the same job and time", async () => {
    const { db, close, a } = await setup();
    try {
      await seedJob(db, a.id, "Acme", "acme-lead", "Lead");
      const created = await createApiToken(scoped(db, a.id), "Test");
      if (!created.ok) throw new Error("token setup failed");
      const res = await bridgeFetch(depsFor(db))("http://test.local/api/bridge/opportunities/acme-lead/context", {
        headers: { authorization: `Bearer ${created.data.token}` },
      });
      expect(res.status).toBe(200);
      const body = await res.text();
      const out = await getJobContext.handler(ctxFor(db, a.id), getJobContext.input.parse({ slug: "acme-lead" }));
      if (!out.ok) throw new Error("failed");
      expect(out.text).toBe(body);
    } finally {
      await close();
    }
  });

  it("the three tools declare readOnlyHint true and openWorldHint false", () => {
    for (const t of [listJobs, getJob, getJobContext]) {
      expect(t.annotations.readOnlyHint).toBe(true);
      expect(t.annotations.openWorldHint).toBe(false);
    }
  });
});
