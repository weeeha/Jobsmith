import type { WireListResponse } from "@/lib/bridge/wire";
import { bridgeRequest } from "../http";
import { formatList } from "../output";
import type { CliIo } from "../io";

// The same extraction as pull and push use: try to read the server's own
// error message out of the body, and fall back to the raw text when the
// shape is not what is expected, so a response this CLI did not anticipate
// (an upstream proxy's own HTML error page, for example) still prints
// something rather than throwing out of the command.
function extractServerMessage(text: string): string {
  try {
    const parsed = JSON.parse(text) as { error?: { message?: unknown } };
    if (typeof parsed.error?.message === "string") {
      return parsed.error.message;
    }
    return text;
  } catch {
    return text;
  }
}

export async function runList(io: CliIo, creds: { url: string; token: string }): Promise<number> {
  const response = await bridgeRequest(io, creds, "GET", "/api/bridge/opportunities");
  if (!response.ok) {
    io.stderr(`Could not reach ${creds.url}: ${response.message}.\n`);
    return 1;
  }
  if (response.status === 401) {
    io.stderr("The server refused the token. Create a new one in Settings and run jobsmith login.\n");
    return 1;
  }
  if (response.status !== 200) {
    const message = extractServerMessage(response.text);
    io.stderr(`Error: ${message}\n`);
    return 1;
  }

  const body = JSON.parse(response.text) as WireListResponse;
  io.stdout(formatList(body.opportunities));
  return 0;
}
