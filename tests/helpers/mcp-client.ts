import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type { BridgeDeps } from "@/lib/bridge/auth";
import { handleMcp } from "@/lib/bridge/mcp-handler";

export const MCP_TEST_URL = "http://localhost/api/bridge/mcp";

export async function connectClient(deps: BridgeDeps, token: string): Promise<Client> {
  const inProcess: typeof fetch = async (input, init) => handleMcp(deps, new Request(input as string | URL, init));
  const transport = new StreamableHTTPClientTransport(new URL(MCP_TEST_URL), {
    fetch: inProcess,
    requestInit: { headers: { authorization: `Bearer ${token}` } },
  });
  const client = new Client({ name: "jobsmith-test-client", version: "0.0.0" });
  await client.connect(transport);
  return client;
}
