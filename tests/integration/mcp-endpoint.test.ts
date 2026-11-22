import { describe, expect, it, vi } from "vitest";
import { makeTestDb, createTestUser } from "../helpers/db";
import { connectClient, MCP_TEST_URL } from "../helpers/mcp-client";
import { scoped } from "@/lib/db/scoped";
import type { Db } from "@/lib/db/client";
import type { BridgeDeps } from "@/lib/bridge/auth";
import { handleMcp } from "@/lib/bridge/mcp-handler";
import { createApiToken, revokeApiToken } from "@/lib/auth/api-token";
import { defaultStages } from "@/lib/pipeline/rules";
import { APP_VERSION } from "@/lib/app-version";
import { MCP_INSTRUCTIONS } from "@/lib/mcp/instructions";
import { RATE_LIMIT_PER_MINUTE } from "@/lib/bridge/wire";

const NOW = new Date("2026-11-21T12:00:00.000Z");

function depsFor(db: Db): BridgeDeps {
  let n = 0;
  return { db, now: () => NOW, revalidate: () => {}, requestId: () => `req-${++n}`, appUrl: "http://localhost:3000" };
}

async function seedJob(db: Db, userId: string, slug: string) {
  const s = scoped(db, userId);
  const c = await s.company.insert({ name: `Co ${slug}`, nameKey: `co-${slug}` });
  const opp = await s.opportunity.insert({ companyId: c.id, slug, roleTitle: "Designer", postingMd: "BODY" });
  const stages = await s.stage.insertMany(
    defaultStages().map((d, i) => ({ opportunityId: opp.id, kind: d.kind, label: d.label, position: i })),
  );
  await s.opportunity.update(opp.id, { currentStageId: stages[0]!.id });
  return opp;
}

async function tokenFor(db: Db, userId: string) {
  const created = await createApiToken(scoped(db, userId), "T");
  if (!created.ok) throw new Error("token");
  return created.data.token;
}

async function setup() {
  const { db, close } = await makeTestDb();
  const a = await createTestUser(db, "a@example.com");
  const b = await createTestUser(db, "b@example.com");
  await seedJob(db, a.id, "acme-lead");
  await seedJob(db, b.id, "other-job");
  const deps = depsFor(db);
  const tokenA = await tokenFor(db, a.id);
  return { db, close, a, b, deps, tokenA };
}

function raw(token: string | null, body: unknown, extra: Record<string, string> = {}) {
  return new Request(MCP_TEST_URL, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json, text/event-stream", ...(token ? { authorization: `Bearer ${token}` } : {}), ...extra },
    body: JSON.stringify(body),
  });
}

const text = (r: { content: unknown }) => (r.content as { type: string; text: string }[])[0]!.text;

describe("MCP endpoint through the SDK client", () => {
  it("initialize answers serverInfo jobsmith with APP_VERSION, the instructions, and tools and resources only", async () => {
    const { close, deps, tokenA } = await setup();
    try {
      const client = await connectClient(deps, tokenA);
      expect(client.getServerVersion()).toMatchObject({ name: "jobsmith", version: APP_VERSION });
      expect(client.getInstructions()).toBe(MCP_INSTRUCTIONS);
      expect(client.getServerCapabilities()).toEqual({
        tools: { listChanged: false },
        resources: { subscribe: false, listChanged: false },
      });
      await client.close();
    } finally {
      await close();
    }
  });

  it("tools/list returns exactly the milestone 30 tools with their schemas (snapshot)", async () => {
    const { close, deps, tokenA } = await setup();
    try {
      const client = await connectClient(deps, tokenA);
      const { tools } = await client.listTools();
      expect(tools.map((t) => t.name).sort()).toEqual(["get_job", "get_job_context", "get_profile", "list_jobs", "write_document"]);
      expect(tools.sort((x, y) => x.name.localeCompare(y.name))).toMatchSnapshot();
      await client.close();
    } finally {
      await close();
    }
  });

  it("tools/call list_jobs, get_job, get_job_context, write_document answer for the token's user", async () => {
    const { close, deps, tokenA } = await setup();
    try {
      const client = await connectClient(deps, tokenA);
      const list = await client.callTool({ name: "list_jobs", arguments: {} });
      expect((list.structuredContent as { jobs: { slug: string }[] }).jobs.map((j) => j.slug)).toEqual(["acme-lead"]);
      expect(JSON.parse(text(list as never))).toEqual(list.structuredContent);
      const job = await client.callTool({ name: "get_job", arguments: { slug: "acme-lead" } });
      expect(job.structuredContent).toMatchObject({ schema: "job/v1" });
      const ctx = await client.callTool({ name: "get_job_context", arguments: { slug: "acme-lead" } });
      expect(ctx.isError).toBeFalsy();
      const w = await client.callTool({ name: "write_document", arguments: { slug: "acme-lead", key: "cv", kind: "cv", body_md: "# CV" } });
      expect(w.structuredContent).toMatchObject({ key: "cv", status: "created", version: 1 });
      await client.close();
    } finally {
      await close();
    }
  });

  it("write_document twice through the client reports created then unchanged", async () => {
    const { close, deps, tokenA } = await setup();
    try {
      const client = await connectClient(deps, tokenA);
      const args = { slug: "acme-lead", key: "cv", kind: "cv", body_md: "# CV" };
      const first = await client.callTool({ name: "write_document", arguments: args });
      const second = await client.callTool({ name: "write_document", arguments: args });
      expect(first.structuredContent).toMatchObject({ status: "created", version: 1 });
      expect(second.structuredContent).toMatchObject({ status: "unchanged", version: 1 });
      await client.close();
    } finally {
      await close();
    }
  });

  it("resources/templates/list, resources/list and resources/read answer", async () => {
    const { close, deps, tokenA } = await setup();
    try {
      const client = await connectClient(deps, tokenA);
      const templates = await client.listResourceTemplates();
      expect(templates.resourceTemplates).toHaveLength(2);
      const list = await client.listResources();
      expect(list.resources.map((r) => r.uri)).toEqual(["jobsmith://jobs/acme-lead/context", "jobsmith://jobs/acme-lead"]);
      const read = await client.readResource({ uri: "jobsmith://jobs/acme-lead" });
      expect(JSON.parse((read.contents[0] as { text: string }).text)).toMatchObject({ schema: "job/v1" });
      await expect(client.readResource({ uri: "jobsmith://jobs/nope" })).rejects.toMatchObject({ code: -32002 });
      await client.close();
    } finally {
      await close();
    }
  });

  it("prompts/list and completion/complete answer method not found until milestone 32", async () => {
    const { close, deps, tokenA } = await setup();
    try {
      const client = await connectClient(deps, tokenA);
      await expect(client.listPrompts()).rejects.toMatchObject({ code: -32601 });
      await expect(
        client.complete({ ref: { type: "ref/prompt", name: "x" }, argument: { name: "a", value: "b" } }),
      ).rejects.toMatchObject({ code: -32601 });
      await client.close();
    } finally {
      await close();
    }
  });

  it("401 without a token, with a revoked token", async () => {
    const { db, close, a, deps, tokenA } = await setup();
    try {
      const ping = { jsonrpc: "2.0", id: 1, method: "ping" };
      expect((await handleMcp(deps, raw(null, ping))).status).toBe(401);
      expect((await handleMcp(deps, raw(tokenA, ping))).status).toBe(200);
      const [row] = await scoped(db, a.id).apiToken.list();
      await revokeApiToken(scoped(db, a.id), row!.id);
      expect((await handleMcp(deps, raw(tokenA, ping))).status).toBe(401);
      await expect(connectClient(deps, tokenA)).rejects.toThrow();
    } finally {
      await close();
    }
  });

  it("the 121st message in a window is 429 with Retry-After; initialize, tools/list and tools/call each count once", async () => {
    const { close, deps, tokenA } = await setup();
    try {
      const client = await connectClient(deps, tokenA); // initialize + initialized: 2
      await client.listTools(); // 3
      await client.callTool({ name: "list_jobs", arguments: {} }); // 4
      for (let i = 4; i < RATE_LIMIT_PER_MINUTE; i++) {
        const res = await handleMcp(deps, raw(tokenA, { jsonrpc: "2.0", id: i, method: "ping" }));
        expect(res.status).toBe(200);
      }
      const limited = await handleMcp(deps, raw(tokenA, { jsonrpc: "2.0", id: 999, method: "ping" }));
      expect(limited.status).toBe(429);
      expect(limited.headers.get("retry-after")).not.toBeNull();
    } finally {
      await close();
    }
  });

  it("a tool whose database call throws returns isError with the request id and no stack text", async () => {
    const { db, close, deps, tokenA } = await setup();
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const client = await connectClient(deps, tokenA);
      const real = db.select.bind(db);
      let armed = false;
      (db as unknown as { select: unknown }).select = (...args: unknown[]) => {
        if (armed) throw new Error("boom at /secret/path.ts:1:1");
        return (real as (...a: unknown[]) => unknown)(...args);
      };
      armed = true;
      const res = await client.callTool({ name: "list_jobs", arguments: {} });
      expect(res.isError).toBe(true);
      expect(text(res as never)).toMatch(/^Something went wrong on the server\. Request id /);
      expect(text(res as never)).not.toMatch(/boom|secret|\.ts/);
    } finally {
      err.mockRestore();
      await close();
    }
  });

  it("a call for another user's slug returns isError not_found and never data", async () => {
    const { close, deps, tokenA } = await setup();
    try {
      const client = await connectClient(deps, tokenA);
      for (const name of ["get_job", "get_job_context"]) {
        const res = await client.callTool({ name, arguments: { slug: "other-job" } });
        expect(res.isError).toBe(true);
        expect(text(res as never)).toBe("No job with the slug other-job.");
        expect(res.structuredContent).toBeUndefined();
      }
      const w = await client.callTool({ name: "write_document", arguments: { slug: "other-job", key: "cv", kind: "cv", body_md: "x" } });
      expect(w.isError).toBe(true);
      await client.close();
    } finally {
      await close();
    }
  });

  it("sends no CORS headers and never reads a cookie (a cookie-only request is 401)", async () => {
    const { close, deps, tokenA } = await setup();
    try {
      const ping = { jsonrpc: "2.0", id: 1, method: "ping" };
      const cookieOnly = await handleMcp(deps, raw(null, ping, { cookie: "better-auth.session_token=abc" }));
      expect(cookieOnly.status).toBe(401);
      const ok = await handleMcp(deps, raw(tokenA, ping));
      for (const res of [ok, cookieOnly]) {
        expect([...res.headers.keys()].filter((k) => k.startsWith("access-control-"))).toEqual([]);
      }
    } finally {
      await close();
    }
  });
});
