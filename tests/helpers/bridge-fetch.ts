import { handleMcp } from "@/lib/bridge/mcp-handler";
import type { BridgeDeps } from "@/lib/bridge/handlers";
import { handleListEvents, handleGetJob, handleListOpportunities, handleGetContext, handlePushArtifacts } from "@/lib/bridge/handlers";

export function bridgeFetch(deps: BridgeDeps): typeof fetch {
  return (async (input: RequestInfo | URL, init?: RequestInit) => {
    const request = new Request(input, init);
    const url = new URL(request.url);

    if (url.pathname === "/api/bridge/mcp") {
      return handleMcp(deps, request);
    }
    if (request.method === "GET" && url.pathname === "/api/bridge/opportunities") {
      return handleListOpportunities(deps, request);
    }
    if (request.method === "GET" && url.pathname === "/api/bridge/events") {
      return handleListEvents(deps, request);
    }
    const jobMatch = /^\/api\/bridge\/opportunities\/([^/]+)$/.exec(url.pathname);
    if (request.method === "GET" && jobMatch) {
      return handleGetJob(deps, request, decodeURIComponent(jobMatch[1]!));
    }
    const contextMatch = /^\/api\/bridge\/opportunities\/([^/]+)\/context$/.exec(url.pathname);
    if (request.method === "GET" && contextMatch) {
      // Next's own dynamic route params come back decoded (ctx.params in the
      // real route handlers); this stub decodes the matched segment too, so
      // a slug the CLI encoded to build the URL reaches the handler the same
      // way it would in production.
      return handleGetContext(deps, request, decodeURIComponent(contextMatch[1]!));
    }
    const artifactsMatch = /^\/api\/bridge\/opportunities\/([^/]+)\/artifacts$/.exec(url.pathname);
    if (request.method === "PUT" && artifactsMatch) {
      return handlePushArtifacts(deps, request, decodeURIComponent(artifactsMatch[1]!));
    }
    return new Response("Not Found", { status: 404 });
  }) as typeof fetch;
}
