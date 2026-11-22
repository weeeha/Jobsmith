// Protocol facts for the MCP endpoint, confirmed against the installed
// @modelcontextprotocol/sdk (see tests/unit/mcp-sdk-probe.test.ts) and the
// published specification revision 2025-06-18.
import { SUPPORTED_PROTOCOL_VERSIONS } from "@modelcontextprotocol/sdk/types.js";

// The SDK's own list: the newest revision first, then the older ones it still
// negotiates. It includes the baseline revision "2025-06-18".
export const MCP_SUPPORTED_VERSIONS: readonly string[] = SUPPORTED_PROTOCOL_VERSIONS;

// The eight JSON-RPC methods milestone 30 answers.
export const IMPLEMENTED_METHODS: ReadonlySet<string> = new Set([
  "initialize",
  "notifications/initialized",
  "ping",
  "tools/list",
  "tools/call",
  "resources/list",
  "resources/templates/list",
  "resources/read",
]);

// "sdk": the app answers MCP through the SDK's Web-standard Streamable HTTP
// transport (WebStandardStreamableHTTPServerTransport, stateless, JSON mode),
// which the probe showed works with zod 4 and a plain Request. "rpc" would mean
// a hand-written lib/mcp/rpc.ts in Task 10; not needed.
export const MCP_PATH_BRANCH: "sdk" | "rpc" = "sdk";
