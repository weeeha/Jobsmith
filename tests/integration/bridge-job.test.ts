import { describe, expect, it } from "vitest";
import { makeTestDb, createTestUser } from "../helpers/db";
import { bridgeFetch } from "../helpers/bridge-fetch";
import { scoped } from "@/lib/db/scoped";
import type { Db } from "@/lib/db/client";
import type { BridgeDeps } from "@/lib/bridge/handlers";
import { createApiToken } from "@/lib/auth/api-token";
import { defaultStages } from "@/lib/pipeline/rules";

const BASE = "http://test.local";
const NOW = new Date("2026-11-21T12:00:00.000Z");

function depsFor(db: Db): BridgeDeps {
  let n = 0;
  return { db, now: () => NOW, revalidate: () => {}, requestId: () => `req-${++n}` };
}

async function seed(db: Db, email: string, slug: string) {
  const user = await createTestUser(db, email);
  const s = scoped(db, user.id);
  const company = await s.company.insert({ name: "Northwind Traders", nameKey: `nw-${slug}` });
  const opp = await s.opportunity.insert({ companyId: company.id, slug, roleTitle: "Designer", postingMd: "BODY TEXT" });
  const stages = await s.stage.insertMany(
    defaultStages().map((d, i) => ({ opportunityId: opp.id, kind: d.kind, label: d.label, position: i })),
  );
  await s.opportunity.update(opp.id, { currentStageId: stages[0]!.id });
  const created = await createApiToken(s, "Test");
  if (!created.ok) throw new Error("token setup failed");
  return { s, opp, company, stages, token: created.data.token };
}

function get(db: Db, token: string | null, path: string) {
  const headers: Record<string, string> = token ? { authorization: `Bearer ${token}` } : {};
  return bridgeFetch(depsFor(db))(`${BASE}${path}`, { headers });
}

describe("GET /api/bridge/opportunities/:slug", () => {
  it("answers job/v1 for the token's own job", async () => {
    const { db, close } = await makeTestDb();
    try {
      const { token, stages } = await seed(db, "a@example.com", "nw-designer");
      const res = await get(db, token, "/api/bridge/opportunities/nw-designer");
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body).toMatchObject({
        schema: "job/v1",
        slug: "nw-designer",
        role: "Designer",
        status: "active",
        generated_at: NOW.toISOString(),
        company: { name: "Northwind Traders" },
        current_stage: { id: stages[0]!.id },
        fit: null,
      });
      expect(body.stages).toHaveLength(stages.length);
      expect(JSON.stringify(body)).not.toContain("BODY TEXT");
      expect(res.headers.get("x-request-id")).toBe("req-1");
      expect(body).not.toHaveProperty("requestId");
    } finally {
      await close();
    }
  });

  it("answers 404 not_found for another user's slug and for a slug with a slash", async () => {
    const { db, close } = await makeTestDb();
    try {
      const a = await seed(db, "a@example.com", "nw-designer");
      await seed(db, "b@example.com", "other-job");
      const other = await get(db, a.token, "/api/bridge/opportunities/other-job");
      expect(other.status).toBe(404);
      expect((await other.json()).error.code).toBe("not_found");
      const slash = await get(db, a.token, "/api/bridge/opportunities/nw%2Fdesigner");
      expect(slash.status).toBe(404);
      expect((await slash.json()).error.code).toBe("not_found");
    } finally {
      await close();
    }
  });

  it("carries the empty values for documents, prep and requests while their cycles are absent", async () => {
    const { db, close } = await makeTestDb();
    try {
      const { token } = await seed(db, "a@example.com", "nw-designer");
      const body = await (await get(db, token, "/api/bridge/opportunities/nw-designer")).json();
      expect(body.documents).toEqual([]);
      expect(body.prep).toEqual({ questions: 0, solid: 0, okay: 0, shaky: 0, unmarked: 0 });
      expect(body.requests).toEqual([]);
    } finally {
      await close();
    }
  });

  it("401 without a token", async () => {
    const { db, close } = await makeTestDb();
    try {
      await seed(db, "a@example.com", "nw-designer");
      expect((await get(db, null, "/api/bridge/opportunities/nw-designer")).status).toBe(401);
    } finally {
      await close();
    }
  });
});
