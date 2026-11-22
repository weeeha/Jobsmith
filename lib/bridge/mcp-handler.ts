import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import type { BridgeDeps } from "./auth";
import { authenticate } from "./auth";
import { bridgeError, readJsonCapped } from "./http";
import { MAX_PUSH_BYTES } from "./wire";
import { logBridgeError, logMcp } from "./log";
import { MCP_SUPPORTED_VERSIONS } from "@/lib/mcp/protocol";
import { createMcpServer } from "@/lib/mcp/server";

type Outcome = { response: Response; code: string; method?: string; tool?: string };

function rpcError(code: number, message: string, requestId: string, status = 400): Response {
  return Response.json(
    { jsonrpc: "2.0", id: null, error: { code, message } },
    { status, headers: { "x-request-id": requestId, "cache-control": "no-store" } },
  );
}

function appOrigin(appUrl: string | undefined): string | null {
  if (!appUrl) return null;
  try {
    return new URL(appUrl).origin;
  } catch {
    return null;
  }
}

async function run(deps: BridgeDeps, request: Request, requestId: string, onTool: (tool: string, code: string) => void): Promise<Outcome> {
  // 1. Only POST. This endpoint opens no stream and keeps no session.
  if (request.method !== "POST") {
    const response = Response.json(
      { error: { code: "method_not_allowed", message: "This endpoint accepts POST only." }, requestId },
      { status: 405, headers: { Allow: "POST", "x-request-id": requestId, "cache-control": "no-store" } },
    );
    return { response, code: "method_not_allowed" };
  }
  // 2. Origin: a browser sends one, a command line client does not. The SDK
  // lets a missing header through, so the app-level rule lives here.
  const origin = request.headers.get("origin");
  if (origin !== null && origin !== appOrigin(deps.appUrl)) {
    return { response: bridgeError("origin_refused", requestId), code: "origin_refused" };
  }
  // 3. Authentication; each POST counts once toward the rate window.
  const now = deps.now();
  const auth = await authenticate(deps, request, requestId, now);
  if (!auth.ok) {
    return { response: auth.response, code: auth.response.status === 429 ? "rate_limited" : "unauthorized" };
  }
  // 4. A present protocol version header must be one we speak.
  const version = request.headers.get("mcp-protocol-version");
  if (version !== null && !MCP_SUPPORTED_VERSIONS.includes(version)) {
    return {
      response: bridgeError("invalid_payload", requestId, { text: "Unsupported MCP-Protocol-Version." }),
      code: "invalid_payload",
    };
  }
  // 5. Body under the cap.
  const body = await readJsonCapped(request, MAX_PUSH_BYTES);
  if (!body.ok) {
    if (body.code === "payload_too_large") {
      return { response: bridgeError("payload_too_large", requestId), code: "payload_too_large" };
    }
    return { response: rpcError(-32700, "Parse error.", requestId), code: "parse_error" };
  }
  const message = body.data;
  // 6. No batches; one message per POST.
  if (typeof message !== "object" || message === null || Array.isArray(message)) {
    return { response: rpcError(-32600, "Invalid request: send one JSON-RPC message per POST.", requestId), code: "invalid_request" };
  }
  const rpc = message as { id?: unknown; method?: unknown; params?: unknown };
  const method = typeof rpc.method === "string" ? rpc.method : undefined;
  const params = rpc.params as { name?: unknown } | undefined;
  const tool = method === "tools/call" && typeof params?.name === "string" ? params.name : undefined;
  // 7. A notification gets 202 and no body.
  if (method !== undefined && !("id" in rpc)) {
    return { response: new Response(null, { status: 202, headers: { "x-request-id": requestId } }), code: "ok", method };
  }
  // 8. Delegate to a fresh server and transport for this user.
  const server = createMcpServer({ s: auth.s, deps, requestId, now }, { onToolOutcome: onTool });
  const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
  await server.connect(transport);
  const response = await transport.handleRequest(request, { parsedBody: message });
  const headers = new Headers(response.headers);
  headers.set("x-request-id", requestId);
  headers.set("cache-control", "no-store");
  return {
    response: new Response(response.body, { status: response.status, headers }),
    code: response.ok ? "ok" : `http_${response.status}`,
    method,
    tool,
  };
}

export async function handleMcp(deps: BridgeDeps, request: Request): Promise<Response> {
  const requestId = deps.requestId();
  const started = Date.now();
  let toolCode: string | undefined;
  let outcome: Outcome;
  try {
    outcome = await run(deps, request, requestId, (_tool, code) => {
      toolCode = code;
    });
  } catch (error) {
    logBridgeError(requestId, error);
    outcome = { response: bridgeError("server_error", requestId), code: "server_error" };
  }
  // 9. One line: ids and names, never an argument or a body.
  logMcp({ requestId, method: outcome.method ?? request.method, tool: outcome.tool, code: toolCode ?? outcome.code, ms: Date.now() - started });
  return outcome.response;
}
