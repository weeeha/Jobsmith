import { MAX_PUSH_BYTES } from "@/lib/bridge/wire";
import { CLI_VERSION } from "./version";
import type { CliIo } from "./io";

const MAX_IN_FLIGHT = 4;
const MAX_RETRY_WAIT_MS = 30_000;
const REQUEST_TIMEOUT_MS = 60_000;

type RpcId = string | number | null;

function line(value: unknown): string {
  return `${JSON.stringify(value)}\n`;
}

function errorReply(id: RpcId, code: number, message: string) {
  return { jsonrpc: "2.0", id, error: { code, message } };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function retryWaitMs(header: string | null): number {
  const seconds = header === null ? 1 : Number(header);
  if (!Number.isFinite(seconds) || seconds < 0) {
    return 1000;
  }
  return Math.min(seconds * 1000, MAX_RETRY_WAIT_MS);
}

export async function runRelay(
  io: CliIo & { stdin: AsyncIterable<string | Uint8Array> },
  creds: { url: string; token: string },
): Promise<number> {
  const endpoint = `${creds.url}/api/bridge/mcp`;
  let protocolVersion: string | null = null;
  let inFlight = 0;
  const waiting: Array<() => void> = [];
  const pending = new Set<Promise<void>>();

  async function acquire(): Promise<void> {
    if (inFlight < MAX_IN_FLIGHT) {
      inFlight += 1;
      return;
    }
    await new Promise<void>((resolve) => waiting.push(resolve));
  }
  function release(): void {
    const next = waiting.shift();
    if (next) {
      next(); // the slot passes straight to the next waiter
    } else {
      inFlight -= 1;
    }
  }

  function post(text: string): Promise<Response> {
    return io.fetch(endpoint, {
      method: "POST",
      redirect: "manual",
      headers: {
        authorization: `Bearer ${creds.token}`,
        accept: "application/json, text/event-stream",
        "content-type": "application/json",
        "user-agent": `jobsmith-cli/${CLI_VERSION}`,
        ...(protocolVersion ? { "mcp-protocol-version": protocolVersion } : {}),
      },
      body: text,
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  }

  async function handle(text: string): Promise<void> {
    let id: RpcId = null;
    let method = "unknown";
    let isNotification = false;
    let isInitialize = false;
    try {
      const parsed = JSON.parse(text) as { id?: unknown; method?: unknown };
      if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) {
        if (typeof parsed.method === "string") {
          method = parsed.method;
        }
        if (typeof parsed.id === "string" || typeof parsed.id === "number") {
          id = parsed.id;
        } else if (!("id" in parsed) && typeof parsed.method === "string") {
          isNotification = true;
        }
        isInitialize = parsed.method === "initialize";
      }
    } catch {
      // Unparseable: send it as is and let the server answer -32700.
    }

    // One stderr line per failure; a notification has no reply to carry it.
    const fail = (status: string, code: number, message: string) => {
      io.stderr(`jobsmith mcp: ${method} failed (${status}).\n`);
      if (!isNotification) {
        io.stdout(line(errorReply(id, code, message)));
      }
    };
    const unreachable = (status: string) =>
      fail(status, -32003, `The server could not be reached. Request id ${isNotification ? "none" : (id ?? "none")}.`);

    let response: Response;
    try {
      response = await post(text);
      if (response.status === 429) {
        const wait = retryWaitMs(response.headers.get("retry-after"));
        await response.body?.cancel().catch(() => {});
        await sleep(wait);
        response = await post(text);
      }
    } catch {
      unreachable("network");
      return;
    }

    const status = response.status;
    if (status === 401) {
      fail("401", -32001, "Token missing or revoked. Run jobsmith login.");
      return;
    }
    if (status === 429) {
      fail("429", -32002, "Rate limited. Try again in a minute.");
      return;
    }
    if (status >= 500 || (status >= 300 && status < 400)) {
      unreachable(String(status));
      return;
    }
    if (status === 202) {
      return;
    }
    const contentType = response.headers.get("content-type") ?? "";
    if (contentType.includes("text/event-stream")) {
      await response.body?.cancel().catch(() => {});
      unreachable("event-stream");
      return;
    }
    let body: unknown;
    try {
      body = JSON.parse(await response.text());
    } catch {
      unreachable(String(status));
      return;
    }
    const reply = body as { jsonrpc?: unknown; id?: unknown; result?: { protocolVersion?: unknown }; error?: { message?: unknown } };
    if (typeof reply === "object" && reply !== null && reply.jsonrpc === "2.0") {
      if (isNotification) {
        io.stderr(`jobsmith mcp: ${method} failed (${status}).\n`);
        return;
      }
      if (reply.id === null || reply.id === undefined) {
        reply.id = id;
      }
      if (status === 200 && isInitialize && typeof reply.result?.protocolVersion === "string") {
        protocolVersion = reply.result.protocolVersion;
      }
      if (status !== 200) {
        io.stderr(`jobsmith mcp: ${method} failed (${status}).\n`);
      }
      io.stdout(line(reply));
      return;
    }
    // A bridge-shaped error ({ error: { code, message } }) or anything else
    // that is not a JSON-RPC message: wrap it, never forward it raw.
    const message =
      typeof reply?.error?.message === "string" ? reply.error.message : "The server sent a reply the relay could not read.";
    fail(String(status), -32603, message);
  }

  let buffer: Buffer[] = [];
  let buffered = 0;
  let discarding = false;

  function dispatch(bytes: Buffer): void {
    const text = bytes.toString("utf8").replace(/\r$/, "");
    if (text.trim() === "") {
      return;
    }
    const run = (async () => {
      await acquire();
      try {
        await handle(text);
      } finally {
        release();
      }
    })();
    const tracked = run.finally(() => pending.delete(tracked));
    pending.add(tracked);
  }

  function tooLarge(): void {
    io.stderr("jobsmith mcp: message rejected (larger than 4 MB).\n");
    io.stdout(line(errorReply(null, -32600, "The message is larger than 4 MB.")));
  }

  function takeLine(): Buffer {
    const joined = Buffer.concat(buffer, buffered);
    buffer = [];
    buffered = 0;
    return joined;
  }

  for await (const chunk of io.stdin) {
    const bytes = typeof chunk === "string" ? Buffer.from(chunk, "utf8") : Buffer.from(chunk);
    let start = 0;
    while (start <= bytes.length) {
      const newline = bytes.indexOf(0x0a, start);
      const end = newline === -1 ? bytes.length : newline;
      const piece = bytes.subarray(start, end);
      if (!discarding) {
        if (buffered + piece.length > MAX_PUSH_BYTES) {
          discarding = true;
          buffer = [];
          buffered = 0;
          tooLarge();
        } else if (piece.length > 0) {
          buffer.push(piece);
          buffered += piece.length;
        }
      }
      if (newline === -1) {
        break;
      }
      if (discarding) {
        discarding = false;
      } else {
        dispatch(takeLine());
      }
      start = newline + 1;
      if (start === bytes.length) {
        break;
      }
    }
    // Back-pressure: do not read further while every slot is busy.
    while (inFlight >= MAX_IN_FLIGHT && pending.size > 0) {
      await Promise.race(pending);
    }
  }
  if (!discarding && buffered > 0) {
    dispatch(takeLine());
  }
  await Promise.all(pending);
  return 0;
}
