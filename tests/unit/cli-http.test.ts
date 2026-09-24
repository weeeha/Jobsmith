import { describe, expect, it } from "vitest";
import { bridgeRequest, extractServerMessage, parseJson } from "@/cli/src/http";
import type { CliIo } from "@/cli/src/io";

function testIo(overrides: Partial<CliIo> = {}): CliIo {
  return {
    fetch: globalThis.fetch,
    env: {},
    cwd: "/",
    homedir: "/home/test",
    stdout: () => {},
    stderr: () => {},
    readSecret: async () => "",
    ...overrides,
  };
}

describe("bridgeRequest", () => {
  it("reports a thrown fetch error as an unreached-server failure", async () => {
    const io = testIo({
      fetch: (async () => {
        throw new Error("getaddrinfo ENOTFOUND test.local");
      }) as typeof fetch,
    });
    const result = await bridgeRequest(io, { url: "http://test.local", token: "t" }, "GET", "/x");
    expect(result).toEqual({ ok: false, message: "getaddrinfo ENOTFOUND test.local", refused: true });
  });

  it("passes redirect: manual, and treats a 3xx answer as a failure rather than following it", async () => {
    const calls: RequestInit[] = [];
    const io = testIo({
      fetch: (async (_input: RequestInfo | URL, init?: RequestInit) => {
        calls.push(init!);
        return new Response(null, { status: 302, headers: { location: "https://example.com/login" } });
      }) as typeof fetch,
    });
    const result = await bridgeRequest(io, { url: "http://test.local", token: "t" }, "GET", "/x");
    expect(result).toEqual({ ok: false, message: "it answered with a redirect", refused: false });
    expect(calls[0]!.redirect).toBe("manual");
  });

  it("still returns a normal 200 answer as ok", async () => {
    const io = testIo({
      fetch: (async () => new Response('{"a":1}', { status: 200 })) as typeof fetch,
    });
    const result = await bridgeRequest(io, { url: "http://test.local", token: "t" }, "GET", "/x");
    expect(result).toEqual({ ok: true, status: 200, text: '{"a":1}' });
  });
});

describe("extractServerMessage", () => {
  it("reads the message out of a bridge error body", () => {
    expect(extractServerMessage('{"error":{"code":"not_found","message":"No job with the slug x."}}')).toBe(
      "No job with the slug x.",
    );
  });

  it("falls back to the raw text when it is not the expected shape", () => {
    expect(extractServerMessage("<html>not json</html>")).toBe("<html>not json</html>");
  });
});

describe("parseJson", () => {
  it("parses a well-formed body", () => {
    expect(parseJson('{"a":1}')).toEqual({ ok: true, value: { a: 1 } });
  });

  it("reports a body that does not parse, without throwing", () => {
    expect(parseJson("<html>not json</html>")).toEqual({ ok: false });
  });
});
