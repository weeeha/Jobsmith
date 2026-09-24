import { TOKEN_PATTERN } from "@/lib/bridge/wire";
import { bridgeRequest } from "../http";
import { writeCredentials } from "../config";
import type { CliIo } from "../io";

export async function runLogin(io: CliIo, command: { url: string }): Promise<number> {
  const secret = await io.readSecret("Token: ");
  const token = secret.trim();

  if (!TOKEN_PATTERN.test(token)) {
    io.stderr("That does not look like a Jobsmith token.\n");
    return 1;
  }

  const response = await bridgeRequest(io, { url: command.url, token }, "GET", "/api/bridge/opportunities");
  if (!response.ok) {
    io.stderr(`Could not reach ${command.url}: ${response.message}.\n`);
    return 1;
  }
  if (response.status !== 200) {
    // Login has no separate concept of "a different kind of server error"
    // the way list/pull/push do: there is nothing else logging in could
    // partially succeed at, so any non-200 status is treated the same way.
    io.stderr("The server refused this token.\n");
    return 1;
  }

  const path = await writeCredentials(io, { url: command.url, token });
  io.stdout(`Logged in to ${command.url}. Saved to ${path}.\n`);
  return 0;
}
