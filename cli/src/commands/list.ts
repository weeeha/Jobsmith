import type { WireListResponse } from "@/lib/bridge/wire";
import { bridgeRequest, extractServerMessage } from "../http";
import { formatList } from "../output";
import type { CliIo } from "../io";

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
