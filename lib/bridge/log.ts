import { DrizzleQueryError } from "drizzle-orm";

// The request id and error name only, never a message: drizzle wraps every
// driver error in a DrizzleQueryError whose own message is the full SQL text
// plus every bound parameter, which for a push can be the document itself.
// The cause's code and constraint (a Postgres error carries both) are the
// only extra detail worth the log line.
export function logBridgeError(requestId: string, error: unknown): void {
  // error.constructor.name rather than error.name: DrizzleQueryError never
  // sets the latter, so it would otherwise log as the unhelpful "Error".
  const name = error instanceof Error ? error.constructor.name : "UnknownError";
  if (error instanceof DrizzleQueryError) {
    const cause = error.cause as { code?: string; constraint?: string } | undefined;
    console.error("[bridge]", requestId, name, { code: cause?.code, constraint: cause?.constraint });
    return;
  }
  console.error("[bridge]", requestId, name);
}

// One line per MCP call: ids and names only, never an argument or a body.
export function logMcp(line: { requestId: string; method: string; tool?: string; code: string; ms: number }): void {
  console.info("[mcp]", line.requestId, line.method, line.tool ?? "-", line.code, `${line.ms}ms`);
}
