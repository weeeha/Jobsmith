import { describe, expect, it, vi } from "vitest";
import { makeTestDb, createTestUser } from "../helpers/db";
import { scoped } from "@/lib/db/scoped";
import type { Db } from "@/lib/db/client";
import type { BridgeDeps } from "@/lib/bridge/auth";
import { handleMcp } from "@/lib/bridge/mcp-handler";
import { createApiToken } from "@/lib/auth/api-token";
import { MAX_PUSH_BYTES } from "@/lib/bridge/wire";

const URL_ = "http://localhost:3000/api/bridge/mcp";
const NOW = new Date("2026-11-21T12:00:00.000Z");
const HEADERS = { "content-type": "application/json", accept: "application/json, text/event-stream" };

function depsFor(db: Db, appUrl: string | undefined | "unset" = "http://localhost:3000"): BridgeDeps {
  let n = 0;
  return { db, now: () => NOW, revalidate: () => {}, requestId: () => `req-${++n}`, appUrl: appUrl === "unset" ? undefined : appUrl };
}

const throwingDb = new Proxy({}, {
  get() {
    throw new Error("database touched");
  },
}) as unknown as Db;

async function setup() {
  const { db, close } = await makeTestDb();
  const user = await createTestUser(db, "h@example.com");
  const created = await createApiToken(scoped(db, user.id), "T");
  if (!created.ok) throw new Error("token");
  return { db, close, token: created.data.token };
}

function post(token: string | null, body: unknown, extra: Record<string, string> = {}) {
  return new Request(URL_, {
    method: "POST",
    headers: { ...HEADERS, ...(token ? { authorization: `Bearer ${token}` } : {}), ...extra },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

describe("handleMcp request order", () => {
  it("GET and DELETE answer 405 with Allow: POST", async () => {
    for (const method of ["GET", "DELETE"]) {
      const res = await handleMcp(depsFor(throwingDb), new Request(URL_, { method }));
      expect(res.status).toBe(405);
      expect(res.headers.get("allow")).toBe("POST");
    }
  });

  it("a foreign Origin answers 403 origin_refused before any database read", async () => {
    const res = await handleMcp(depsFor(throwingDb), post("jsm_x", { jsonrpc: "2.0", id: 1, method: "ping" }, { origin: "https://evil.example" }));
    expect(res.status).toBe(403);
    expect((await res.json()).error.code).toBe("origin_refused");
  });

  it("any Origin is refused when appUrl is unset", async () => {
    const res = await handleMcp(depsFor(throwingDb, "unset"), post("jsm_x", {}, { origin: "http://localhost:3000" }));
    expect(res.status).toBe(403);
  });

  it("no Origin header passes the check, and the app's own origin passes too", async () => {
    const { db, close, token } = await setup();
    try {
      const ping = { jsonrpc: "2.0", id: 1, method: "ping" };
      expect((await handleMcp(depsFor(db), post(token, ping))).status).toBe(200);
      expect((await handleMcp(depsFor(db), post(token, ping, { origin: "http://localhost:3000" }))).status).toBe(200);
      expect((await handleMcp(depsFor(db), post(null, ping))).status).toBe(401);
    } finally {
      await close();
    }
  });

  it("an unsupported MCP-Protocol-Version answers 400; a supported or absent one passes", async () => {
    const { db, close, token } = await setup();
    try {
      const ping = { jsonrpc: "2.0", id: 1, method: "ping" };
      const bad = await handleMcp(depsFor(db), post(token, ping, { "mcp-protocol-version": "1999-01-01" }));
      expect(bad.status).toBe(400);
      const body = await bad.json();
      expect(body.error.code).toBe("invalid_payload");
      expect(body.error.message).toBe("Unsupported MCP-Protocol-Version.");
      expect((await handleMcp(depsFor(db), post(token, ping, { "mcp-protocol-version": "2025-06-18" }))).status).toBe(200);
      expect((await handleMcp(depsFor(db), post(token, ping))).status).toBe(200);
    } finally {
      await close();
    }
  });

  it("a batch array and a non-object answer -32600", async () => {
    const { db, close, token } = await setup();
    try {
      for (const body of [[{ jsonrpc: "2.0", id: 1, method: "ping" }], 5, "null"]) {
        const res = await handleMcp(depsFor(db), post(token, body));
        expect(res.status).toBe(400);
        expect((await res.json()).error.code).toBe(-32600);
      }
    } finally {
      await close();
    }
  });

  it("a notification answers 202 with an empty body", async () => {
    const { db, close, token } = await setup();
    try {
      const res = await handleMcp(depsFor(db), post(token, { jsonrpc: "2.0", method: "notifications/initialized" }));
      expect(res.status).toBe(202);
      expect(await res.text()).toBe("");
    } finally {
      await close();
    }
  });

  it("a body over 4 MB answers 413 payload_too_large", async () => {
    const { db, close, token } = await setup();
    try {
      const big = JSON.stringify({ jsonrpc: "2.0", id: 1, method: "ping", params: { pad: "x".repeat(MAX_PUSH_BYTES) } });
      const res = await handleMcp(depsFor(db), post(token, big));
      expect(res.status).toBe(413);
      expect((await res.json()).error.code).toBe("payload_too_large");
    } finally {
      await close();
    }
  });

  it("writes one [mcp] line per request without the token or arguments", async () => {
    const { db, close, token } = await setup();
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    try {
      await handleMcp(depsFor(db), post(token, { jsonrpc: "2.0", id: 1, method: "ping" }));
      expect(info).toHaveBeenCalledTimes(1);
      const line = info.mock.calls[0]!.join(" ");
      expect(line).toContain("[mcp]");
      expect(line).not.toContain(token);
    } finally {
      info.mockRestore();
      await close();
    }
  });
});
