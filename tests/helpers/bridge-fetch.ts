import type { BridgeDeps } from "@/lib/bridge/handlers";
import { handleListOpportunities, handleGetContext, handlePushArtifacts } from "@/lib/bridge/handlers";

export function bridgeFetch(deps: BridgeDeps): typeof fetch {
  return (async (input: RequestInfo | URL, init?: RequestInit) => {
    const request = new Request(input, init);
    const url = new URL(request.url);

    if (request.method === "GET" && url.pathname === "/api/bridge/opportunities") {
      return handleListOpportunities(deps, request);
    }
    const contextMatch = /^\/api\/bridge\/opportunities\/([^/]+)\/context$/.exec(url.pathname);
    if (request.method === "GET" && contextMatch) {
      return handleGetContext(deps, request, contextMatch[1]!);
    }
    const artifactsMatch = /^\/api\/bridge\/opportunities\/([^/]+)\/artifacts$/.exec(url.pathname);
    if (request.method === "PUT" && artifactsMatch) {
      return handlePushArtifacts(deps, request, artifactsMatch[1]!);
    }
    return new Response("Not Found", { status: 404 });
  }) as typeof fetch;
}
