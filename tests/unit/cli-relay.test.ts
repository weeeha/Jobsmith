import { afterEach, describe, expect, it, vi } from "vitest";
import { runRelay } from "@/cli/src/relay";
import type { CliIo } from "@/cli/src/io";

const CREDS = { url: "http://jobsmith.test", token: "jsm_" + "a".repeat(43) };

type Call = { url: string; init: RequestInit };

function harness(responder: (call: Call, index: number, body: string) => Response | Promise<Response>) {
  const calls: Call[] = [];
  const out: string[] = [];
  const err: string[] = [];
  const fetchFn = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const call = { url: String(input), init: init ?? {} };
    calls.push(call);
    return responder(call, calls.length - 1, String(init?.body));
  }) as typeof fetch;
  const run = (chunks: Array<string | Uint8Array> | AsyncIterable<string | Uint8Array>) => {
    const io: CliIo & { stdin: AsyncIterable<string | Uint8Array> } = {
      fetch: fetchFn,
      env: {},
      cwd: "/",
      homedir: "/",
      stdout: (t) => out.push(t),
      stderr: (t) => err.push(t),
      readSecret: async () => "",
      stdin: Array.isArray(chunks)
        ? (async function* () {
            for (const c of chunks) yield c;
          })()
        : chunks,
    };
    return runRelay(io, CREDS);
  };
  return { calls, out, err, run };
}

const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } });
const req = (id: number, method = "tools/list") => JSON.stringify({ jsonrpc: "2.0", id, method }) + "\n";

afterEach(() => {
  vi.useRealTimers();
});

describe("runRelay", () => {
  it("a JSON reply becomes exactly one stdout line", async () => {
    const h = harness(() => json({ jsonrpc: "2.0", id: 1, result: { tools: [{ name: "a" }] } }));
    expect(await h.run([req(1)])).toBe(0);
    expect(h.out).toEqual([JSON.stringify({ jsonrpc: "2.0", id: 1, result: { tools: [{ name: "a" }] } }) + "\n"]);
    expect(h.err).toEqual([]);
  });

  it("202 writes nothing", async () => {
    const h = harness(() => new Response(null, { status: 202 }));
    await h.run([JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }) + "\n"]);
    expect(h.out).toEqual([]);
    expect(h.err).toEqual([]);
  });

  it("sends authorization, accept 'application/json, text/event-stream', content-type, user-agent, redirect manual and a 60 s timeout signal", async () => {
    const timeout = vi.spyOn(AbortSignal, "timeout");
    const h = harness(() => json({ jsonrpc: "2.0", id: 1, result: {} }));
    await h.run([req(1)]);
    const { url, init } = h.calls[0]!;
    expect(url).toBe("http://jobsmith.test/api/bridge/mcp");
    expect(init.method).toBe("POST");
    expect(init.redirect).toBe("manual");
    const headers = init.headers as Record<string, string>;
    expect(headers.authorization).toBe(`Bearer ${CREDS.token}`);
    expect(headers.accept).toBe("application/json, text/event-stream");
    expect(headers["content-type"]).toBe("application/json");
    expect(headers["user-agent"]).toMatch(/^jobsmith-cli\//);
    expect(init.signal).toBeInstanceOf(AbortSignal);
    expect(timeout).toHaveBeenCalledWith(60_000);
    timeout.mockRestore();
  });

  it("sends MCP-Protocol-Version only after initialize answered, with the version the server returned", async () => {
    const h = harness((_c, _i, body) => {
      const m = JSON.parse(body) as { id: number; method: string };
      return m.method === "initialize"
        ? json({ jsonrpc: "2.0", id: m.id, result: { protocolVersion: "2025-03-26" } })
        : json({ jsonrpc: "2.0", id: m.id, result: {} });
    });
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const stdin = (async function* () {
      yield req(1, "initialize");
      await gate;
      yield req(2);
    })();
    const done = h.run(stdin);
    await vi.waitFor(() => expect(h.out.length).toBe(1));
    release();
    await done;
    expect((h.calls[0]!.init.headers as Record<string, string>)["mcp-protocol-version"]).toBeUndefined();
    expect((h.calls[1]!.init.headers as Record<string, string>)["mcp-protocol-version"]).toBe("2025-03-26");
  });

  it("401 becomes error -32001 'Token missing or revoked. Run jobsmith login.' carrying the request id", async () => {
    const h = harness(() => json({ error: { code: "unauthorized", message: "no" } }, 401));
    await h.run([req(7)]);
    expect(JSON.parse(h.out[0]!)).toEqual({
      jsonrpc: "2.0",
      id: 7,
      error: { code: -32001, message: "Token missing or revoked. Run jobsmith login." },
    });
  });

  it("429 waits Retry-After capped at 30 seconds, retries once, then answers -32002", async () => {
    vi.useFakeTimers();
    const h = harness(() => json({}, 429, { "retry-after": "120" }));
    const done = h.run([req(3)]);
    await vi.advanceTimersByTimeAsync(29_999);
    expect(h.calls.length).toBe(1);
    await vi.advanceTimersByTimeAsync(1);
    await done;
    expect(h.calls.length).toBe(2);
    expect(JSON.parse(h.out[0]!)).toEqual({
      jsonrpc: "2.0",
      id: 3,
      error: { code: -32002, message: "Rate limited. Try again in a minute." },
    });
  });

  it("429 then success relays the second answer", async () => {
    vi.useFakeTimers();
    const h = harness((_c, i) => (i === 0 ? json({}, 429, { "retry-after": "2" }) : json({ jsonrpc: "2.0", id: 3, result: {} })));
    const done = h.run([req(3)]);
    await vi.advanceTimersByTimeAsync(2000);
    await done;
    expect(JSON.parse(h.out[0]!).result).toEqual({});
  });

  it("a network failure and a 500 answer -32003 with the request id", async () => {
    const net = harness(() => {
      throw new TypeError("fetch failed");
    });
    await net.run([req(4)]);
    expect(JSON.parse(net.out[0]!).error).toEqual({ code: -32003, message: "The server could not be reached. Request id 4." });
    const five = harness(() => new Response("boom", { status: 500 }));
    await five.run([req(5)]);
    expect(JSON.parse(five.out[0]!).error).toEqual({ code: -32003, message: "The server could not be reached. Request id 5." });
  });

  it("a 3xx and a text/event-stream reply answer -32003", async () => {
    const redirect = harness(() => new Response(null, { status: 302, headers: { location: "http://elsewhere" } }));
    await redirect.run([req(1)]);
    expect(JSON.parse(redirect.out[0]!).error.code).toBe(-32003);
    const sse = harness(() => new Response("data: {}\n\n", { status: 200, headers: { "content-type": "text/event-stream" } }));
    await sse.run([req(2)]);
    expect(JSON.parse(sse.out[0]!).error.code).toBe(-32003);
  });

  it("a line over 4 MB answers -32600 and is never sent", async () => {
    const h = harness(() => json({ jsonrpc: "2.0", id: 9, result: {} }));
    const huge = "x".repeat(4_194_305);
    // split across chunks, then a normal request after the newline
    await h.run([huge.slice(0, 2_000_000), huge.slice(2_000_000), "\n", req(9)]);
    expect(h.calls.length).toBe(1);
    expect(h.calls[0]!.init.body).toBe(req(9).trim());
    const rejected = JSON.parse(h.out[0]!);
    expect(rejected.error).toEqual({ code: -32600, message: "The message is larger than 4 MB." });
    expect(h.out.length).toBe(2);
  });

  it("keeps a multi-byte character cut across chunks whole", async () => {
    const h = harness((_c, _i, body) => json({ jsonrpc: "2.0", id: 1, result: { echo: JSON.parse(body).params.q } }));
    const bytes = Buffer.from(JSON.stringify({ jsonrpc: "2.0", id: 1, method: "x", params: { q: "é€" } }) + "\n");
    const cut = bytes.indexOf(0xc3) + 1;
    await h.run([bytes.subarray(0, cut), bytes.subarray(cut)]);
    expect(JSON.parse(h.out[0]!).result.echo).toBe("é€");
  });

  it("at most 4 messages are in flight", async () => {
    let active = 0;
    let peak = 0;
    const h = harness(async (_c, _i, body) => {
      active += 1;
      peak = Math.max(peak, active);
      await new Promise((r) => setTimeout(r, 10));
      active -= 1;
      return json({ jsonrpc: "2.0", id: JSON.parse(body).id, result: {} });
    });
    await h.run([[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => req(n)).join("")]);
    expect(h.calls.length).toBe(10);
    expect(h.out.length).toBe(10);
    expect(peak).toBe(4);
  });

  it("stdout holds only protocol lines; one stderr line per failure names the method and status", async () => {
    const h = harness(() => json({}, 401));
    await h.run([req(1, "tools/call")]);
    expect(h.out.every((l) => JSON.parse(l).jsonrpc === "2.0")).toBe(true);
    expect(h.err).toHaveLength(1);
    expect(h.err[0]).toContain("tools/call");
    expect(h.err[0]).toContain("401");
  });

  it("end of stdin waits for in-flight messages, then exits 0", async () => {
    let finish!: () => void;
    const h = harness(
      () => new Promise<Response>((resolve) => (finish = () => resolve(json({ jsonrpc: "2.0", id: 1, result: {} })))),
    );
    let settled = false;
    const done = h.run([req(1)]).then((code) => {
      settled = true;
      return code;
    });
    await vi.waitFor(() => expect(h.calls.length).toBe(1));
    await new Promise((r) => setTimeout(r, 20));
    expect(settled).toBe(false);
    finish();
    expect(await done).toBe(0);
    expect(h.out).toHaveLength(1);
  });

  it("a notification that fails writes no stdout line and one stderr line", async () => {
    const h = harness(() => new Response("boom", { status: 500 }));
    await h.run([JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }) + "\n"]);
    expect(h.out).toEqual([]);
    expect(h.err).toHaveLength(1);
    expect(h.err[0]).toContain("notifications/initialized");
  });
});
