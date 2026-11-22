import { describe, expect, it } from "vitest";
import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { SUPPORTED_PROTOCOL_VERSIONS } from "@modelcontextprotocol/sdk/types.js";

const URL_ = "http://localhost/api/mcp";

function probeServer() {
  const server = new McpServer({ name: "probe-server", version: "0.0.0" });
  server.registerTool(
    "probe",
    {
      description: "probe tool",
      inputSchema: { name: z.string() },
      outputSchema: { greeting: z.string() },
    },
    async ({ name }) => {
      const out = { greeting: `hi ${name}` };
      return { content: [{ type: "text", text: JSON.stringify(out) }], structuredContent: out };
    },
  );
  return server;
}

// Stateless: a fresh server and transport per request, as a route handler would.
async function handle(req: Request): Promise<Response> {
  const server = probeServer();
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });
  await server.connect(transport);
  return transport.handleRequest(req);
}

const HEADERS = { "content-type": "application/json", accept: "application/json, text/event-stream" };
const INIT = {
  jsonrpc: "2.0",
  id: 1,
  method: "initialize",
  params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "t", version: "0" } },
};

function post(body: unknown, extra: Record<string, string> = {}) {
  return new Request(URL_, { method: "POST", headers: { ...HEADERS, ...extra }, body: JSON.stringify(body) });
}

describe("MCP SDK probe", () => {
  it("builds an McpServer whose tool takes a zod 4 input and output schema, lists it and calls it", async () => {
    const res = await handle(post({ jsonrpc: "2.0", id: 2, method: "tools/list" }, { "mcp-protocol-version": "2025-06-18" }));
    const list = await res.json();
    expect(list.result.tools).toHaveLength(1);
    expect(list.result.tools[0].name).toBe("probe");
    expect(list.result.tools[0].inputSchema.type).toBe("object");
    expect(list.result.tools[0].outputSchema.type).toBe("object");

    const call = await (
      await handle(
        post(
          { jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: "probe", arguments: { name: "nick" } } },
          { "mcp-protocol-version": "2025-06-18" },
        ),
      )
    ).json();
    expect(call.result.structuredContent).toEqual({ greeting: "hi nick" });
    expect(call.result.isError).toBeFalsy();
  });

  it("a Web-standard Streamable HTTP server transport answers a POST built from a Request with a JSON body, stateless, JSON responses", async () => {
    const res = await handle(post(INIT));
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("application/json");
    expect(res.headers.get("mcp-session-id")).toBeNull();
    const body = await res.json();
    expect(body.result.protocolVersion).toBe("2025-06-18");
  });

  it("the same transport answers a notification with 202 and no body", async () => {
    const res = await handle(post({ jsonrpc: "2.0", method: "notifications/initialized" }, { "mcp-protocol-version": "2025-06-18" }));
    expect(res.status).toBe(202);
    expect(await res.text()).toBe("");
  });

  it("the SDK Client can be pointed at a custom fetch or a custom Transport so a test calls a route handler in process", async () => {
    const inProcessFetch: typeof fetch = async (input, init) => handle(new Request(input as string | URL, init));
    const transport = new StreamableHTTPClientTransport(new URL(URL_), { fetch: inProcessFetch });
    const client = new Client({ name: "probe-client", version: "0.0.0" });
    await client.connect(transport);
    expect(client.getServerVersion()?.name).toBe("probe-server");
    const tools = await client.listTools();
    expect(tools.tools.map((t) => t.name)).toEqual(["probe"]);
    await client.close();
  });

  it("answers an absent protocol-version header, a bad one with 400, and rejects a wrong Accept with 406", async () => {
    const noHeader = await handle(post({ jsonrpc: "2.0", id: 5, method: "ping" }));
    expect(noHeader.status).toBe(200);
    const bad = await handle(post({ jsonrpc: "2.0", id: 6, method: "ping" }, { "mcp-protocol-version": "1999-01-01" }));
    expect(bad.status).toBe(400);
    const noAccept = await handle(
      new Request(URL_, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(INIT) }),
    );
    expect(noAccept.status).toBe(406);
  });

  it("lists the supported protocol versions and answers an unknown requested version with a supported one", async () => {
    expect(SUPPORTED_PROTOCOL_VERSIONS).toContain("2025-06-18");
    const res = await handle(post({ ...INIT, params: { ...INIT.params, protocolVersion: "1999-01-01" } }));
    const body = await res.json();
    expect(SUPPORTED_PROTOCOL_VERSIONS).toContain(body.result.protocolVersion);
  });
});
