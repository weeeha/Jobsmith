import { describe, expect, it } from "vitest";
import { makeTestDb, createTestUser } from "../helpers/db";
import { scoped } from "@/lib/db/scoped";
import type { Db } from "@/lib/db/client";
import type { BridgeDeps } from "@/lib/bridge/handlers";
import { handleListOpportunities, handleGetContext, handlePushArtifacts } from "@/lib/bridge/handlers";
import { createApiToken, revokeApiToken } from "@/lib/auth/api-token";
import { defaultStages } from "@/lib/pipeline/rules";
import { RATE_LIMIT_PER_MINUTE } from "@/lib/bridge/wire";

const BASE = "http://test.local";

function testDeps(db: Db, overrides: Partial<BridgeDeps> = {}): { deps: BridgeDeps; revalidated: string[] } {
  const revalidated: string[] = [];
  let counter = 0;
  const deps: BridgeDeps = {
    db,
    now: () => new Date(),
    revalidate: (path) => revalidated.push(path),
    requestId: () => `req-${++counter}`,
    ...overrides,
  };
  return { deps, revalidated };
}

async function seedJob(
  db: Db,
  opts: { slug: string; email: string; companyName?: string; nameKey?: string },
) {
  const user = await createTestUser(db, opts.email);
  const s = scoped(db, user.id);
  const company = await s.company.insert({
    name: opts.companyName ?? "Acme Robotics",
    nameKey: opts.nameKey ?? `acme-${opts.slug}`,
  });
  const opportunity = await s.opportunity.insert({
    companyId: company.id,
    slug: opts.slug,
    roleTitle: "Product Designer",
  });
  const drafts = defaultStages();
  const stages = await s.stage.insertMany(
    drafts.map((d, i) => ({ opportunityId: opportunity.id, kind: d.kind, label: d.label, position: i })),
  );
  await s.opportunity.update(opportunity.id, { currentStageId: stages[0]!.id });
  const created = await createApiToken(s, "Test");
  if (!created.ok) throw new Error("token setup failed");
  return { user, s, company, opportunity, stages, token: created.data.token };
}

describe("bridge authentication", () => {
  it("401 for no Authorization header", async () => {
    const { db, close } = await makeTestDb();
    try {
      const { deps } = testDeps(db);
      const response = await handleListOpportunities(deps, new Request(`${BASE}/api/bridge/opportunities`));
      expect(response.status).toBe(401);
      expect((await response.json()).error.code).toBe("unauthorized");
    } finally {
      await close();
    }
  });

  it("401 for a Basic scheme header", async () => {
    const { db, close } = await makeTestDb();
    try {
      const { deps } = testDeps(db);
      const request = new Request(`${BASE}/api/bridge/opportunities`, {
        headers: { authorization: `Basic ${btoa("a:b")}` },
      });
      expect((await handleListOpportunities(deps, request)).status).toBe(401);
    } finally {
      await close();
    }
  });

  it("401 for a bearer value that does not match TOKEN_PATTERN", async () => {
    const { db, close } = await makeTestDb();
    try {
      const { deps } = testDeps(db);
      const request = new Request(`${BASE}/api/bridge/opportunities`, {
        headers: { authorization: "Bearer not-a-real-token" },
      });
      expect((await handleListOpportunities(deps, request)).status).toBe(401);
    } finally {
      await close();
    }
  });

  it("401 for a well-shaped but unknown token", async () => {
    const { db, close } = await makeTestDb();
    try {
      const { deps } = testDeps(db);
      const request = new Request(`${BASE}/api/bridge/opportunities`, {
        headers: { authorization: `Bearer jsm_${"z".repeat(43)}` },
      });
      expect((await handleListOpportunities(deps, request)).status).toBe(401);
    } finally {
      await close();
    }
  });

  it("401 for a revoked token", async () => {
    const { db, close } = await makeTestDb();
    try {
      const { s, token } = await seedJob(db, { slug: "acme-designer", email: "alice@example.com" });
      const list = await s.apiToken.list();
      await revokeApiToken(s, list[0]!.id);
      const { deps } = testDeps(db);
      const request = new Request(`${BASE}/api/bridge/opportunities`, {
        headers: { authorization: `Bearer ${token}` },
      });
      expect((await handleListOpportunities(deps, request)).status).toBe(401);
    } finally {
      await close();
    }
  });

  it("401 for a request carrying only a session-looking cookie, proving the bridge never reads cookies", async () => {
    const { db, close } = await makeTestDb();
    try {
      const { deps } = testDeps(db);
      const request = new Request(`${BASE}/api/bridge/opportunities`, {
        headers: { cookie: "better-auth.session_token=some-real-looking-session-value" },
      });
      const response = await handleListOpportunities(deps, request);
      expect(response.status).toBe(401);
      expect((await response.json()).error.code).toBe("unauthorized");
    } finally {
      await close();
    }
  });
});

describe("bridge rate limiting", () => {
  it("allows exactly RATE_LIMIT_PER_MINUTE requests in one window and 429s the next, with Retry-After", async () => {
    const { db, close } = await makeTestDb();
    try {
      const { token } = await seedJob(db, { slug: "acme-designer", email: "rate@example.com" });
      const fixedNow = new Date("2026-10-01T10:00:05.000Z");
      const { deps } = testDeps(db, { now: () => fixedNow });
      const request = () =>
        new Request(`${BASE}/api/bridge/opportunities`, { headers: { authorization: `Bearer ${token}` } });

      let last!: Response;
      for (let i = 0; i < RATE_LIMIT_PER_MINUTE; i++) {
        last = await handleListOpportunities(deps, request());
        expect(last.status).toBe(200);
      }
      const overLimit = await handleListOpportunities(deps, request());
      expect(overLimit.status).toBe(429);
      const body = await overLimit.json();
      expect(body.error.code).toBe("rate_limited");
      const retryAfter = Number(overLimit.headers.get("Retry-After"));
      expect(retryAfter).toBeGreaterThanOrEqual(1);
      expect(retryAfter).toBeLessThanOrEqual(60);
    } finally {
      await close();
    }
  });
});

describe("a slug that kept a non-ASCII letter", () => {
  it("list, context and push all work for an opportunity slugged ørsted-product-designer", async () => {
    const { db, close } = await makeTestDb();
    try {
      const { s, token, opportunity } = await seedJob(db, {
        slug: "ørsted-product-designer",
        email: "unicode1@example.com",
        companyName: "Ørsted",
        nameKey: "orsted-unicode1",
      });
      const { deps } = testDeps(db);
      const auth = { headers: { authorization: `Bearer ${token}` } };

      const list = await handleListOpportunities(deps, new Request(`${BASE}/api/bridge/opportunities`, auth));
      expect(list.status).toBe(200);
      expect((await list.json()).opportunities).toEqual(
        expect.arrayContaining([expect.objectContaining({ slug: "ørsted-product-designer" })]),
      );

      const context = await handleGetContext(
        deps,
        new Request(`${BASE}/api/bridge/opportunities/ørsted-product-designer/context`, auth),
        "ørsted-product-designer",
      );
      expect(context.status).toBe(200);
      expect(await context.text()).toContain('slug: "ørsted-product-designer"');

      const push = await handlePushArtifacts(
        deps,
        new Request(`${BASE}/api/bridge/opportunities/ørsted-product-designer/artifacts`, {
          method: "PUT",
          headers: { authorization: `Bearer ${token}` },
          body: JSON.stringify({ artifacts: [{ key: "cv", kind: "cv", body_md: "# CV" }] }),
        }),
        "ørsted-product-designer",
      );
      expect(push.status).toBe(200);
      expect((await push.json()).results).toEqual([{ key: "cv", scope: "opportunity", status: "created", version: 1 }]);
      const stored = await s.artifact.getLatest({ opportunityId: opportunity.id }, "cv");
      expect(stored?.bodyMd).toBe("# CV");
    } finally {
      await close();
    }
  });
});

describe("handleListOpportunities", () => {
  it("lists active jobs by default and maps every field", async () => {
    const { db, close } = await makeTestDb();
    try {
      const { token, stages } = await seedJob(db, { slug: "acme-designer", email: "list1@example.com" });
      const { deps } = testDeps(db);
      const request = new Request(`${BASE}/api/bridge/opportunities`, {
        headers: { authorization: `Bearer ${token}` },
      });
      const response = await handleListOpportunities(deps, request);
      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.opportunities).toEqual([
        {
          slug: "acme-designer",
          company: "Acme Robotics",
          role: "Product Designer",
          status: "active",
          stage: { kind: stages[0]!.kind, label: stages[0]!.label },
        },
      ]);
      expect(body.requestId).toBe(response.headers.get("x-request-id"));
    } finally {
      await close();
    }
  });

  it("status=closed and status=all both work; an unrecognized status is 400 invalid_query", async () => {
    const { db, close } = await makeTestDb();
    try {
      const { s, token, opportunity } = await seedJob(db, { slug: "acme-designer", email: "list2@example.com" });
      await s.opportunity.update(opportunity.id, {
        status: "closed",
        closedReason: "withdrawn",
        closedAt: new Date(),
      });
      const { deps } = testDeps(db);
      const auth = { headers: { authorization: `Bearer ${token}` } };

      const active = await handleListOpportunities(deps, new Request(`${BASE}/api/bridge/opportunities`, auth));
      expect((await active.json()).opportunities).toEqual([]);

      const closed = await handleListOpportunities(
        deps,
        new Request(`${BASE}/api/bridge/opportunities?status=closed`, auth),
      );
      expect((await closed.json()).opportunities).toHaveLength(1);

      const all = await handleListOpportunities(deps, new Request(`${BASE}/api/bridge/opportunities?status=all`, auth));
      expect((await all.json()).opportunities).toHaveLength(1);

      const bad = await handleListOpportunities(
        deps,
        new Request(`${BASE}/api/bridge/opportunities?status=nope`, auth),
      );
      expect(bad.status).toBe(400);
      expect((await bad.json()).error).toEqual({
        code: "invalid_query",
        message: "status must be active, closed or all.",
      });
    } finally {
      await close();
    }
  });
});

describe("handleGetContext", () => {
  it("200 with a markdown content type and every section heading", async () => {
    const { db, close } = await makeTestDb();
    try {
      const { token } = await seedJob(db, { slug: "acme-designer", email: "ctx1@example.com" });
      const { deps } = testDeps(db);
      const request = new Request(`${BASE}/api/bridge/opportunities/acme-designer/context`, {
        headers: { authorization: `Bearer ${token}` },
      });
      const response = await handleGetContext(deps, request, "acme-designer");
      expect(response.status).toBe(200);
      expect(response.headers.get("content-type")).toBe("text/markdown; charset=utf-8");
      expect(response.headers.get("cache-control")).toBe("no-store");
      expect(response.headers.get("x-request-id")).toBeTruthy();
      const text = await response.text();
      expect(text).toContain("jobsmith: context/v1");
      expect(text).toContain("## Posting");
      expect(text).toContain("## Stages");
      expect(text).toContain("## People");
      expect(text).toContain("## Preferences");
      expect(text).toContain("## Artifacts");
    } finally {
      await close();
    }
  });

  it("404 not_found for an unknown slug", async () => {
    const { db, close } = await makeTestDb();
    try {
      const { token } = await seedJob(db, { slug: "acme-designer", email: "ctx2@example.com" });
      const { deps } = testDeps(db);
      const request = new Request(`${BASE}/api/bridge/opportunities/no-such-job/context`, {
        headers: { authorization: `Bearer ${token}` },
      });
      const response = await handleGetContext(deps, request, "no-such-job");
      expect(response.status).toBe(404);
      expect((await response.json()).error.code).toBe("not_found");
    } finally {
      await close();
    }
  });

  it("404 for a slug that belongs to another user", async () => {
    const { db, close } = await makeTestDb();
    try {
      await seedJob(db, { slug: "acme-designer", email: "ctx3a@example.com" });
      const { token: bobToken } = await seedJob(db, {
        slug: "northwind-designer",
        email: "ctx3b@example.com",
        companyName: "Northwind Labs",
        nameKey: "northwind-ctx3",
      });
      const { deps } = testDeps(db);
      const request = new Request(`${BASE}/api/bridge/opportunities/acme-designer/context`, {
        headers: { authorization: `Bearer ${bobToken}` },
      });
      const response = await handleGetContext(deps, request, "acme-designer");
      expect(response.status).toBe(404);
    } finally {
      await close();
    }
  });
});

describe("handlePushArtifacts, validation", () => {
  it("400 invalid_query for a dry_run value that is not true, false, 0 or 1", async () => {
    const { db, close } = await makeTestDb();
    try {
      const { token } = await seedJob(db, { slug: "acme-designer", email: "push1@example.com" });
      const { deps } = testDeps(db);
      const request = new Request(`${BASE}/api/bridge/opportunities/acme-designer/artifacts?dry_run=maybe`, {
        method: "PUT",
        headers: { authorization: `Bearer ${token}` },
        body: JSON.stringify({ artifacts: [{ key: "cv", kind: "cv", body_md: "# CV" }] }),
      });
      const response = await handlePushArtifacts(deps, request, "acme-designer");
      expect(response.status).toBe(400);
      expect((await response.json()).error).toEqual({
        code: "invalid_query",
        message: "dry_run must be true or false.",
      });
    } finally {
      await close();
    }
  });

  it("404 not_found for an unknown slug, before the body is ever read", async () => {
    const { db, close } = await makeTestDb();
    try {
      const { token } = await seedJob(db, { slug: "acme-designer", email: "push2@example.com" });
      const { deps } = testDeps(db);
      // A body that would fail to parse if it were ever read: the 404 must
      // still win, proving the slug lookup runs before readJsonCapped.
      const request = new Request(`${BASE}/api/bridge/opportunities/no-such-job/artifacts`, {
        method: "PUT",
        headers: { authorization: `Bearer ${token}` },
        body: "{not json",
      });
      const response = await handlePushArtifacts(deps, request, "no-such-job");
      expect(response.status).toBe(404);
    } finally {
      await close();
    }
  });

  it("413 payload_too_large for a body over 4 MB", async () => {
    const { db, close } = await makeTestDb();
    try {
      const { token } = await seedJob(db, { slug: "acme-designer", email: "push3@example.com" });
      const { deps } = testDeps(db);
      const huge = "x".repeat(5_000_000);
      const request = new Request(`${BASE}/api/bridge/opportunities/acme-designer/artifacts`, {
        method: "PUT",
        headers: { authorization: `Bearer ${token}` },
        body: JSON.stringify({ artifacts: [{ key: "cv", kind: "cv", body_md: huge }] }),
      });
      const response = await handlePushArtifacts(deps, request, "acme-designer");
      expect(response.status).toBe(413);
      expect((await response.json()).error.code).toBe("payload_too_large");
    } finally {
      await close();
    }
  });

  it("400 invalid_json for malformed JSON", async () => {
    const { db, close } = await makeTestDb();
    try {
      const { token } = await seedJob(db, { slug: "acme-designer", email: "push4@example.com" });
      const { deps } = testDeps(db);
      const request = new Request(`${BASE}/api/bridge/opportunities/acme-designer/artifacts`, {
        method: "PUT",
        headers: { authorization: `Bearer ${token}` },
        body: "{not json",
      });
      const response = await handlePushArtifacts(deps, request, "acme-designer");
      expect(response.status).toBe(400);
      expect((await response.json()).error.code).toBe("invalid_json");
    } finally {
      await close();
    }
  });

  it("413 too_many_artifacts for 51 artifacts, checked before the Zod schema even runs", async () => {
    const { db, close } = await makeTestDb();
    try {
      const { token } = await seedJob(db, { slug: "acme-designer", email: "push5@example.com" });
      const { deps } = testDeps(db);
      // Every artifact here is individually well-formed; only the count is
      // wrong, so a version of the handler that ran the schema first would
      // let this through to invalid_payload or 200 instead.
      const artifacts = Array.from({ length: 51 }, (_, i) => ({ key: `k${i}`, kind: "cv", body_md: `# ${i}` }));
      const request = new Request(`${BASE}/api/bridge/opportunities/acme-designer/artifacts`, {
        method: "PUT",
        headers: { authorization: `Bearer ${token}` },
        body: JSON.stringify({ artifacts }),
      });
      const response = await handlePushArtifacts(deps, request, "acme-designer");
      expect(response.status).toBe(413);
      expect((await response.json()).error.code).toBe("too_many_artifacts");
    } finally {
      await close();
    }
  });

  it("400 invalid_payload with the firstIssue text for a schema violation", async () => {
    const { db, close } = await makeTestDb();
    try {
      const { token } = await seedJob(db, { slug: "acme-designer", email: "push6@example.com" });
      const { deps } = testDeps(db);
      const request = new Request(`${BASE}/api/bridge/opportunities/acme-designer/artifacts`, {
        method: "PUT",
        headers: { authorization: `Bearer ${token}` },
        body: JSON.stringify({ artifacts: [{ key: "Not Valid!", kind: "cv", body_md: "# CV" }] }),
      });
      const response = await handlePushArtifacts(deps, request, "acme-designer");
      expect(response.status).toBe(400);
      const body = await response.json();
      expect(body.error.code).toBe("invalid_payload");
      expect(body.error.message).toBe(
        "artifacts.0.key: key must be 1 to 100 lowercase letters, digits, dots, dashes or underscores, starting with a letter or digit.",
      );
    } finally {
      await close();
    }
  });

  it("413 artifact_too_large for a body_md over 1 MB, naming the key", async () => {
    const { db, close } = await makeTestDb();
    try {
      const { token } = await seedJob(db, { slug: "acme-designer", email: "push7@example.com" });
      const { deps } = testDeps(db);
      const request = new Request(`${BASE}/api/bridge/opportunities/acme-designer/artifacts`, {
        method: "PUT",
        headers: { authorization: `Bearer ${token}` },
        body: JSON.stringify({ artifacts: [{ key: "cv", kind: "cv", body_md: "a".repeat(1_048_577) }] }),
      });
      const response = await handlePushArtifacts(deps, request, "acme-designer");
      expect(response.status).toBe(413);
      const body = await response.json();
      expect(body.error).toEqual({ code: "artifact_too_large", message: "cv is larger than 1 MB." });
    } finally {
      await close();
    }
  });

  it("400 duplicate_key for a repeated key in one push", async () => {
    const { db, close } = await makeTestDb();
    try {
      const { token } = await seedJob(db, { slug: "acme-designer", email: "push8@example.com" });
      const { deps } = testDeps(db);
      const request = new Request(`${BASE}/api/bridge/opportunities/acme-designer/artifacts`, {
        method: "PUT",
        headers: { authorization: `Bearer ${token}` },
        body: JSON.stringify({
          artifacts: [
            { key: "cv", kind: "cv", body_md: "# CV one" },
            { key: "cv", kind: "cv", body_md: "# CV two" },
          ],
        }),
      });
      const response = await handlePushArtifacts(deps, request, "acme-designer");
      expect(response.status).toBe(400);
      const body = await response.json();
      expect(body.error).toEqual({ code: "duplicate_key", message: "The key cv appears more than once in this push." });
    } finally {
      await close();
    }
  });
});

describe("handlePushArtifacts, applying a push", () => {
  it("creates every artifact, reports created, writes one event, and revalidates only the pushed job", async () => {
    const { db, close } = await makeTestDb();
    try {
      const { s, token, opportunity } = await seedJob(db, { slug: "acme-designer", email: "apply1@example.com" });
      const { deps, revalidated } = testDeps(db);
      const request = new Request(`${BASE}/api/bridge/opportunities/acme-designer/artifacts`, {
        method: "PUT",
        headers: { authorization: `Bearer ${token}` },
        body: JSON.stringify({
          artifacts: [
            { key: "cv", kind: "cv", body_md: "# CV" },
            { key: "cover-letter", kind: "cover_letter", body_md: "# Cover letter" },
          ],
        }),
      });
      const response = await handlePushArtifacts(deps, request, "acme-designer");
      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.dryRun).toBe(false);
      expect(body.results).toEqual(
        expect.arrayContaining([
          { key: "cv", scope: "opportunity", status: "created", version: 1 },
          { key: "cover-letter", scope: "opportunity", status: "created", version: 1 },
        ]),
      );
      expect(body.warnings).toEqual([]);

      const events = await s.event.listForOpportunity(opportunity.id);
      expect(events.filter((e) => e.kind === "artifact_pushed")).toHaveLength(1);
      expect(revalidated).toEqual(["/jobs/acme-designer"]);
    } finally {
      await close();
    }
  });

  it("a repeat push reports unchanged, writes no new event, and revalidates nothing", async () => {
    const { db, close } = await makeTestDb();
    try {
      const { s, token, opportunity } = await seedJob(db, { slug: "acme-designer", email: "apply2@example.com" });
      const push = () =>
        handlePushArtifacts(
          testDeps(db).deps,
          new Request(`${BASE}/api/bridge/opportunities/acme-designer/artifacts`, {
            method: "PUT",
            headers: { authorization: `Bearer ${token}` },
            body: JSON.stringify({ artifacts: [{ key: "cv", kind: "cv", body_md: "# CV" }] }),
          }),
          "acme-designer",
        );

      const first = await push();
      expect((await first.json()).results).toEqual([{ key: "cv", scope: "opportunity", status: "created", version: 1 }]);

      const { deps: secondDeps, revalidated } = testDeps(db);
      const second = await handlePushArtifacts(
        secondDeps,
        new Request(`${BASE}/api/bridge/opportunities/acme-designer/artifacts`, {
          method: "PUT",
          headers: { authorization: `Bearer ${token}` },
          body: JSON.stringify({ artifacts: [{ key: "cv", kind: "cv", body_md: "# CV" }] }),
        }),
        "acme-designer",
      );
      expect((await second.json()).results).toEqual([
        { key: "cv", scope: "opportunity", status: "unchanged", version: 1 },
      ]);
      expect(revalidated).toEqual([]);

      const events = await s.event.listForOpportunity(opportunity.id);
      expect(events.filter((e) => e.kind === "artifact_pushed")).toHaveLength(1);
    } finally {
      await close();
    }
  });

  it("a dry run reports what would happen and writes and revalidates nothing", async () => {
    const { db, close } = await makeTestDb();
    try {
      const { s, token, opportunity } = await seedJob(db, { slug: "acme-designer", email: "apply3@example.com" });
      const { deps, revalidated } = testDeps(db);
      const request = new Request(`${BASE}/api/bridge/opportunities/acme-designer/artifacts?dry_run=true`, {
        method: "PUT",
        headers: { authorization: `Bearer ${token}` },
        body: JSON.stringify({ artifacts: [{ key: "cv", kind: "cv", body_md: "# CV" }] }),
      });
      const response = await handlePushArtifacts(deps, request, "acme-designer");
      const body = await response.json();
      expect(body.dryRun).toBe(true);
      expect(body.results).toEqual([{ key: "cv", scope: "opportunity", status: "created", version: 1 }]);

      expect(await s.artifact.listLatestForOpportunity(opportunity.id)).toEqual([]);
      expect(await s.event.listForOpportunity(opportunity.id)).toEqual([]);
      expect(revalidated).toEqual([]);
    } finally {
      await close();
    }
  });

  it("revalidates every job at the company for a company-scoped change, and only the one job otherwise", async () => {
    const { db, close } = await makeTestDb();
    try {
      const user = await createTestUser(db, "apply4@example.com");
      const s = scoped(db, user.id);
      const company = await s.company.insert({ name: "Acme Robotics", nameKey: "acme-apply4" });
      const jobA = await s.opportunity.insert({ companyId: company.id, slug: "acme-designer-a", roleTitle: "Designer" });
      const jobB = await s.opportunity.insert({ companyId: company.id, slug: "acme-designer-b", roleTitle: "Design lead" });
      for (const opp of [jobA, jobB]) {
        const drafts = defaultStages();
        const stages = await s.stage.insertMany(
          drafts.map((d, i) => ({ opportunityId: opp.id, kind: d.kind, label: d.label, position: i })),
        );
        await s.opportunity.update(opp.id, { currentStageId: stages[0]!.id });
      }
      const created = await createApiToken(s, "Test");
      if (!created.ok) throw new Error("token setup failed");
      const token = created.data.token;

      // A job-scoped push to A only revalidates A.
      const jobScoped = testDeps(db);
      await handlePushArtifacts(
        jobScoped.deps,
        new Request(`${BASE}/api/bridge/opportunities/acme-designer-a/artifacts`, {
          method: "PUT",
          headers: { authorization: `Bearer ${token}` },
          body: JSON.stringify({ artifacts: [{ key: "cv", kind: "cv", body_md: "# CV" }] }),
        }),
        "acme-designer-a",
      );
      expect(jobScoped.revalidated).toEqual(["/jobs/acme-designer-a"]);

      // A company-scoped push to A revalidates both A and B, with no duplicates.
      const companyScoped = testDeps(db);
      const response = await handlePushArtifacts(
        companyScoped.deps,
        new Request(`${BASE}/api/bridge/opportunities/acme-designer-a/artifacts`, {
          method: "PUT",
          headers: { authorization: `Bearer ${token}` },
          body: JSON.stringify({
            artifacts: [{ key: "recon", kind: "research", scope: "company", body_md: "# Recon" }],
          }),
        }),
        "acme-designer-a",
      );
      expect(response.status).toBe(200);
      expect(new Set(companyScoped.revalidated)).toEqual(new Set(["/jobs/acme-designer-a", "/jobs/acme-designer-b"]));
      expect(companyScoped.revalidated).toHaveLength(2);
    } finally {
      await close();
    }
  });

  it("user B's token gets 404 for user A's slug, and a push through it changes nothing of A's", async () => {
    const { db, close } = await makeTestDb();
    try {
      const { s: sa, opportunity } = await seedJob(db, { slug: "acme-designer", email: "tenant-a@example.com" });
      const { token: bobToken } = await seedJob(db, {
        slug: "northwind-designer",
        email: "tenant-b@example.com",
        companyName: "Northwind Labs",
        nameKey: "northwind-tenant-b",
      });
      const { deps } = testDeps(db);
      const request = new Request(`${BASE}/api/bridge/opportunities/acme-designer/artifacts`, {
        method: "PUT",
        headers: { authorization: `Bearer ${bobToken}` },
        body: JSON.stringify({ artifacts: [{ key: "cv", kind: "cv", body_md: "# Hacked" }] }),
      });
      const response = await handlePushArtifacts(deps, request, "acme-designer");
      expect(response.status).toBe(404);
      expect((await response.json()).error.code).toBe("not_found");
      expect(await sa.artifact.listLatestForOpportunity(opportunity.id)).toEqual([]);
    } finally {
      await close();
    }
  });
});
