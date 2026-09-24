import { describe, expect, it } from "vitest";
import { parseBearer, readJsonCapped, bridgeJson, bridgeError } from "@/lib/bridge/http";

describe("parseBearer", () => {
  it("extracts a token that matches TOKEN_PATTERN from a Bearer header", () => {
    const token = `jsm_${"A".repeat(43)}`;
    expect(parseBearer(`Bearer ${token}`)).toBe(token);
  });

  it("matches the scheme case-insensitively", () => {
    const token = `jsm_${"A".repeat(43)}`;
    expect(parseBearer(`bearer ${token}`)).toBe(token);
    expect(parseBearer(`BEARER ${token}`)).toBe(token);
  });

  it("returns null for a missing header, a different scheme, or no token", () => {
    expect(parseBearer(null)).toBeNull();
    expect(parseBearer(`Basic ${btoa("a:b")}`)).toBeNull();
    expect(parseBearer("Bearer")).toBeNull();
    expect(parseBearer("Bearer ")).toBeNull();
  });

  it("returns null when the token does not match TOKEN_PATTERN, even with the right scheme", () => {
    expect(parseBearer("Bearer not-a-real-token")).toBeNull();
    expect(parseBearer(`Bearer jsm_${"A".repeat(42)}`)).toBeNull();
  });
});

describe("readJsonCapped", () => {
  it("parses a small JSON body under the cap", async () => {
    const request = new Request("http://t/x", { method: "PUT", body: JSON.stringify({ a: 1 }) });
    const result = await readJsonCapped(request, 1024);
    expect(result).toEqual({ ok: true, data: { a: 1 } });
  });

  it("rejects a body over the cap by a truthful Content-Length header", async () => {
    const big = "x".repeat(5000);
    const request = new Request("http://t/x", { method: "PUT", body: JSON.stringify({ big }) });
    const result = await readJsonCapped(request, 1024);
    expect(result).toMatchObject({ ok: false, code: "payload_too_large" });
  });

  it("rejects a body over the cap read as a stream with no Content-Length at all", async () => {
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        for (let i = 0; i < 10; i++) controller.enqueue(new TextEncoder().encode("y".repeat(200)));
        controller.close();
      },
    });
    const request = new Request("http://t/x", { method: "PUT", body: stream, duplex: "half" } as RequestInit);
    const result = await readJsonCapped(request, 1024);
    expect(result).toMatchObject({ ok: false, code: "payload_too_large" });
  });

  it("rejects a body over the cap even when Content-Length lies about being small", async () => {
    const big = "x".repeat(5000);
    const request = new Request("http://t/x", {
      method: "PUT",
      body: JSON.stringify({ big }),
      headers: { "content-length": "10" },
    });
    const result = await readJsonCapped(request, 1024);
    expect(result).toMatchObject({ ok: false, code: "payload_too_large" });
  });

  it("rejects malformed JSON that is still under the cap", async () => {
    const request = new Request("http://t/x", { method: "PUT", body: "{nope" });
    const result = await readJsonCapped(request, 1024);
    expect(result).toMatchObject({ ok: false, code: "invalid_json" });
  });
});

describe("bridgeJson", () => {
  it("sets x-request-id, cache-control: no-store, and the given status", async () => {
    const response = bridgeJson({ ok: true }, { status: 201, requestId: "req-1" });
    expect(response.status).toBe(201);
    expect(response.headers.get("x-request-id")).toBe("req-1");
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual({ ok: true });
  });

  it("defaults to status 200 and merges extra headers", async () => {
    const response = bridgeJson({ a: 1 }, { requestId: "req-2", headers: { "x-extra": "1" } });
    expect(response.status).toBe(200);
    expect(response.headers.get("x-extra")).toBe("1");
    expect(response.headers.get("x-request-id")).toBe("req-2");
  });
});

describe("bridgeError", () => {
  it("builds the WireError shape with the code's own status and message", async () => {
    const response = bridgeError("not_found", "req-3", { slug: "acme-designer" });
    expect(response.status).toBe(404);
    expect(response.headers.get("x-request-id")).toBe("req-3");
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual({
      error: { code: "not_found", message: "No job with the slug acme-designer." },
      requestId: "req-3",
    });
  });

  it("passes extra headers through, e.g. Retry-After for rate_limited", async () => {
    const response = bridgeError("rate_limited", "req-4", { seconds: 30 }, { "Retry-After": "30" });
    expect(response.status).toBe(429);
    expect(response.headers.get("Retry-After")).toBe("30");
    expect(await response.json()).toMatchObject({ error: { code: "rate_limited" } });
  });
});
