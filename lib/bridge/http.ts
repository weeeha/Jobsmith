import { type Result, ok, fail } from "@/lib/result";
import { TOKEN_PATTERN } from "./wire";
import { BRIDGE_ERRORS, type BridgeErrorCode, type BridgeErrorDetail } from "./errors";

export function parseBearer(header: string | null): string | null {
  if (!header) {
    return null;
  }
  const match = /^bearer\s+(.+)$/i.exec(header.trim());
  if (!match) {
    return null;
  }
  const token = match[1]!.trim();
  return TOKEN_PATTERN.test(token) ? token : null;
}

// Reads the body under a hard byte cap. It must hold in five cases: a truthful Content-Length over the cap, a stream with no
// Content-Length at all, a lying Content-Length under the cap while the
// stream itself is over it, a small body under the cap, and malformed JSON.
// The internal fail() messages here are never shown to a caller directly;
// every handler reports the user-facing text through bridgeError, keyed off
// the returned code.
export async function readJsonCapped(
  request: Request,
  maxBytes: number,
): Promise<Result<unknown, "payload_too_large" | "invalid_json">> {
  const declared = Number(request.headers.get("content-length") ?? "NaN");
  if (Number.isFinite(declared) && declared > maxBytes) {
    return fail("payload_too_large", "Declared content length exceeds the cap.");
  }
  if (!request.body) {
    return fail("invalid_json", "The request has no body.");
  }
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    total += value.byteLength;
    if (total > maxBytes) {
      // Stop reading immediately: a lying or absent Content-Length must not
      // let an attacker force the server to buffer an unbounded stream
      // before the cap is enforced.
      await reader.cancel();
      return fail("payload_too_large", "The request body exceeds the cap.");
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    return ok(JSON.parse(text));
  } catch {
    return fail("invalid_json", "The request body is not valid JSON.");
  }
}

export function bridgeJson(
  body: object,
  init: { status?: number; requestId: string; headers?: Record<string, string> },
): Response {
  return Response.json(body, {
    status: init.status ?? 200,
    headers: {
      "x-request-id": init.requestId,
      "cache-control": "no-store",
      ...init.headers,
    },
  });
}

export function bridgeError(
  code: BridgeErrorCode,
  requestId: string,
  detail: BridgeErrorDetail = {},
  headers?: Record<string, string>,
): Response {
  const entry = BRIDGE_ERRORS[code];
  const message = entry.message({ ...detail, requestId });
  return bridgeJson({ error: { code, message }, requestId }, { status: entry.status, requestId, headers });
}
