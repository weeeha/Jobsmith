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
      // Never follow a redirect on our own: a proxy's own sign-in page can
      // answer any bridge path with a 200 login page once fetch follows it
      // there, which would otherwise look like a real reply from the
      // bridge. Manual mode hands back the 3xx itself instead.
      redirect: "manual",
      headers: {
        authorization: `Bearer ${creds.token}`,
        "user-agent": `jobsmith-cli/${CLI_VERSION}`,
        accept: "application/json",
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(30_000),
    });
    if (response.status >= 300 && response.status < 400) {
      // A server was reached, so this is not the "refused" case below: a
      // future caller that cares about the difference can already tell
      // them apart from this field.
      return { ok: false, message: "it answered with a redirect", refused: false };
    }
    const text = await response.text();
    return { ok: true, status: response.status, text };
  } catch (error) {
    // Every failure this function can produce on its own is a network-level
    // one: a DNS failure, a refused connection, a TLS error, or the
    // 30-second timeout firing. The request never reached a server that
    // could answer at all, so refused is always true here.
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

// Shared by every command that expects a JSON body on a 200 response: a
// proxy or an unrelated server can still answer 200 with something else
// entirely (an HTML page, plain text), and JSON.parse throws on that rather
// than returning a value a caller could check.
export function parseJson(text: string): { ok: true; value: unknown } | { ok: false } {
  try {
    return { ok: true, value: JSON.parse(text) };
  } catch {
    return { ok: false };
  }
}
