import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { McpError, ErrorCode, ListResourcesRequestSchema, ListResourceTemplatesRequestSchema, ReadResourceRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { TOOLS } from "./tools";
import type { ToolContext, ToolOutcome } from "./registry";
import { MCP_INSTRUCTIONS } from "./instructions";
import { internalFailure } from "./errors";
import { listResources, readResource, RESOURCE_TEMPLATES } from "./resources";
import { APP_VERSION } from "@/lib/app-version";
import { logBridgeError } from "@/lib/bridge/log";

export type ServerHooks = { onToolOutcome?(tool: string, code: string): void };

// A resource that does not exist is -32002 in the specification.
const RESOURCE_NOT_FOUND = -32002;

export function toCallToolResult(outcome: ToolOutcome): CallToolResult {
  if (!outcome.ok) {
    return { isError: true, content: [{ type: "text", text: outcome.message }] };
  }
  const content: CallToolResult["content"] = [];
  if (outcome.structured !== undefined) {
    // Older clients read only content, so the JSON is repeated as text.
    content.push({ type: "text", text: JSON.stringify(outcome.structured) });
  } else if (outcome.text !== undefined) {
    content.push({ type: "text", text: outcome.text });
  }
  for (const link of outcome.links ?? []) {
    content.push({ type: "resource_link", uri: link.uri, name: link.name, mimeType: link.mimeType });
  }
  const result: CallToolResult = { content };
  if (outcome.structured !== undefined) result.structuredContent = outcome.structured as Record<string, unknown>;
  return result;
}

// One server per request: the transport is stateless and answers one request.
export function createMcpServer(ctx: ToolContext, hooks: ServerHooks = {}): McpServer {
  const server = new McpServer(
    { name: "jobsmith", version: APP_VERSION },
    { instructions: MCP_INSTRUCTIONS, capabilities: { tools: { listChanged: false }, resources: { subscribe: false, listChanged: false } } },
  );

  for (const tool of TOOLS) {
    server.registerTool(
      tool.name,
      {
        title: tool.title,
        description: tool.description,
        inputSchema: tool.input as never,
        ...(tool.output ? { outputSchema: tool.output as never } : {}),
        annotations: tool.annotations,
      },
      (async (args: unknown) => {
        let outcome: ToolOutcome;
        try {
          outcome = await tool.handler(ctx, args as never);
        } catch (error) {
          logBridgeError(ctx.requestId, error);
          outcome = internalFailure(ctx.requestId);
        }
        hooks.onToolOutcome?.(tool.name, outcome.ok ? "ok" : outcome.code);
        return toCallToolResult(outcome);
      }) as never,
    );
  }

  const low = server.server;
  low.setRequestHandler(ListResourcesRequestSchema, async (request) => {
    const page = await listResources(ctx, request.params?.cursor ?? null);
    return { resources: page.resources, ...(page.nextCursor ? { nextCursor: page.nextCursor } : {}) };
  });
  low.setRequestHandler(ListResourceTemplatesRequestSchema, async () => ({ resourceTemplates: RESOURCE_TEMPLATES }));
  low.setRequestHandler(ReadResourceRequestSchema, async (request) => {
    const result = await readResource(ctx, request.params.uri);
    if (!result.ok) {
      throw new McpError(result.code === "not_found" ? RESOURCE_NOT_FOUND : ErrorCode.InvalidParams, result.message);
    }
    return { contents: [result.value] };
  });

  // The SDK announces listChanged: true for tools and resources; this server
  // never sends the notification, so say so before the capabilities are read.
  const caps = (server.server as unknown as { _capabilities: Record<string, { listChanged?: boolean } | undefined> })._capabilities;
  for (const name of ["tools", "resources"]) {
    const entry = caps[name];
    if (entry) entry.listChanged = false;
  }

  return server;
}
