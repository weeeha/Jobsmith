import { CLI_VERSION } from "./version";
import type { CliIo } from "./io";

export async function bridgeRequest(
  io: CliIo,
  creds: { url: string; token: string },
  method: "GET" | "PUT",
  path: string,
  body?: unknown,
): Promise<{ ok: true; status: number; text: string } | { ok: false; message: string; refused: boolean }> {
  try {
    const response = await io.fetch(`${creds.url}${path}`, {
      method,
      headers: {
        authorization: `Bearer ${creds.token}`,
        "user-agent": `jobsmith-cli/${CLI_VERSION}`,
        accept: "application/json",
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(30_000),
    });
    const text = await response.text();
    return { ok: true, status: response.status, text };
  } catch (error) {
    // Every failure this function can produce on its own is a network-level
    // one: a DNS failure, a refused connection, a TLS error, or the
    // 30-second timeout firing. The request never reached a server that
    // could answer at all, so refused is always true here; the field exists
    // so a caller or a future extension of this function could distinguish
    // a network failure from some other kind without another type change,
    // even though there is exactly one way to reach this branch today.
    return { ok: false, message: error instanceof Error ? error.message : String(error), refused: true };
  }
}

// Shared by list, pull and push: try to read the server's own error message
// out of the body, and fall back to the raw text when the shape is not what
// is expected, so a response this CLI did not anticipate (an upstream
// proxy's own HTML error page, for example) still prints something rather
// than throwing out of the command.
export function extractServerMessage(text: string): string {
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
