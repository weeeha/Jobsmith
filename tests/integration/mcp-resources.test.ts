import { describe, expect, it } from "vitest";
import { makeTestDb, createTestUser } from "../helpers/db";
import { scoped } from "@/lib/db/scoped";
import type { Db } from "@/lib/db/client";
import type { BridgeDeps } from "@/lib/bridge/handlers";
import { defaultStages } from "@/lib/pipeline/rules";
import { getJobContext } from "@/lib/mcp/tools/get-job-context";
import { RESOURCE_TEMPLATES, listResources, readResource } from "@/lib/mcp/resources";
import type { ToolContext } from "@/lib/mcp/registry";

const NOW = new Date("2026-11-21T12:00:00.000Z");

function depsFor(db: Db): BridgeDeps {
  let n = 0;
  return { db, now: () => NOW, revalidate: () => {}, requestId: () => `req-${++n}` };
}

async function seedJob(db: Db, userId: string, slug: string, extra: Record<string, unknown> = {}) {
  const s = scoped(db, userId);
  const c = await s.company.insert({ name: `Co ${slug}`, nameKey: `co-${slug}` });
  const opp = await s.opportunity.insert({ companyId: c.id, slug, roleTitle: "Designer", postingMd: "BODY", ...extra });
  const stages = await s.stage.insertMany(
    defaultStages().map((d, i) => ({ opportunityId: opp.id, kind: d.kind, label: d.label, position: i })),
  );
  await s.opportunity.update(opp.id, { currentStageId: stages[0]!.id });
  return opp;
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

describe("mcp resources", () => {
  it("resources/templates lists two templates (no document template: Apply and Research is absent)", () => {
    expect(RESOURCE_TEMPLATES.map((t) => [t.uriTemplate, t.mimeType])).toEqual([
      ["jobsmith://jobs/{slug}/context", "text/markdown"],
      ["jobsmith://jobs/{slug}", "application/json"],
    ]);
  });

  it("listResources returns context and job/v1 per active job, newest first, 50 per page, cursor continues without repeats", async () => {
    const { db, close, a } = await setup();
    try {
      for (let i = 0; i < 30; i++) {
        // seedJob ends with an update, which stamps updatedAt; the pause keeps the stamps distinct.
        await seedJob(db, a.id, `job-${String(i).padStart(2, "0")}`);
        await new Promise((r) => setTimeout(r, 5));
      }
      const ctx = ctxFor(db, a.id);
      const p1 = await listResources(ctx, null);
      expect(p1.resources).toHaveLength(50);
      expect(p1.nextCursor).not.toBeNull();
      expect(p1.resources[0]!.uri).toBe("jobsmith://jobs/job-29/context");
      expect(p1.resources[1]).toMatchObject({ uri: "jobsmith://jobs/job-29", mimeType: "application/json" });
      const p2 = await listResources(ctx, p1.nextCursor);
      expect(p2.resources).toHaveLength(10);
      expect(p2.nextCursor).toBeNull();
      const uris = [...p1.resources, ...p2.resources].map((r) => r.uri);
      expect(new Set(uris).size).toBe(60);
    } finally {
      await close();
    }
  });

  it("a closed job is not listed", async () => {
    const { db, close, a } = await setup();
    try {
      await seedJob(db, a.id, "open-one");
      const shut = await seedJob(db, a.id, "shut-one");
      await scoped(db, a.id).opportunity.update(shut.id, { status: "closed", closedReason: "withdrawn", closedAt: NOW });
      const out = await listResources(ctxFor(db, a.id), null);
      const uris = out.resources.map((r) => r.uri);
      expect(uris).toContain("jobsmith://jobs/open-one");
      expect(uris.some((u) => u.includes("shut-one"))).toBe(false);
    } finally {
      await close();
    }
  });

  it("readResource of a context URI returns the same markdown as get_job_context", async () => {
    const { db, close, a } = await setup();
    try {
      await seedJob(db, a.id, "acme-lead");
      const ctx = ctxFor(db, a.id);
      const tool = await getJobContext.handler(ctx, { slug: "acme-lead" });
      const res = await readResource(ctx, "jobsmith://jobs/acme-lead/context");
      expect(tool.ok && res.ok).toBe(true);
      if (!tool.ok || !res.ok) return;
      expect(res.value).toEqual({ uri: "jobsmith://jobs/acme-lead/context", mimeType: "text/markdown", text: tool.text });
    } finally {
      await close();
    }
  });

  it("readResource of a job URI returns job/v1 JSON text", async () => {
    const { db, close, a } = await setup();
    try {
      await seedJob(db, a.id, "acme-lead");
      const res = await readResource(ctxFor(db, a.id), "jobsmith://jobs/acme-lead");
      expect(res.ok).toBe(true);
      if (!res.ok) return;
      expect(res.value.mimeType).toBe("application/json");
      expect(JSON.parse(res.value.text).schema).toBe("job/v1");
    } finally {
      await close();
    }
  });

  it("an unknown slug, a slug with a slash and a malformed URI return not_found or invalid, never another user's data", async () => {
    const { db, close, a, b } = await setup();
    try {
      await seedJob(db, b.id, "bs-job");
      const ctx = ctxFor(db, a.id);
      const other = await readResource(ctx, "jobsmith://jobs/bs-job");
      expect(other).toMatchObject({ ok: false, code: "not_found" });
      const otherCtx = await readResource(ctx, "jobsmith://jobs/bs-job/context");
      expect(otherCtx).toMatchObject({ ok: false, code: "not_found" });
      expect(await readResource(ctx, "jobsmith://jobs/nope")).toMatchObject({ ok: false, code: "not_found" });
      for (const bad of ["jobsmith://jobs/a/b", "jobsmith://jobs/..%2Fx", "jobsmith://jobs/", "http://x/y", "jobsmith://jobs/bs-job/documents/cv", "nonsense"]) {
        expect(await readResource(ctx, bad)).toMatchObject({ ok: false, code: "invalid" });
      }
    } finally {
      await close();
    }
  });
});
