import { afterAll, beforeAll, describe, expect, it } from "vitest";
import http from "node:http";
import zlib from "node:zlib";
import { guardedFetch, type ResolveHost } from "@/lib/intake/fetch-guard";
import { isPublicAddress, type AddressPolicy } from "@/lib/intake/address-policy";

describe("guardedFetch", () => {
  const hits: Record<string, number> = {};
  const hostHeaders: string[] = [];
  const bigBody = "x".repeat(3 * 1024 * 1024);
  const bomb = zlib.gzipSync(Buffer.alloc(10 * 1024 * 1024, 0x61));
  const smallHtml = `<html><body><p>${"Posting text. ".repeat(80)}</p></body></html>`;

  let server: http.Server;
  let port: number;
  let base: string;

  beforeAll(async () => {
    server = http.createServer((req, res) => {
      const route = (req.url ?? "/").split("?")[0]!;
      hits[route] = (hits[route] ?? 0) + 1;
      hostHeaders.push(String(req.headers.host));
      const redirectMatch = /^\/redirect\/(\d+)$/.exec(route);
      if (redirectMatch) {
        const n = Number(redirectMatch[1]);
        res.writeHead(302, { location: n === 0 ? "/html" : `/redirect/${n - 1}` });
        res.end();
        return;
      }
      switch (route) {
        case "/html":
          res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
          res.end(smallHtml);
          return;
        case "/json":
          res.writeHead(200, { "content-type": "application/json" });
          res.end(JSON.stringify({ ok: true }));
          return;
        case "/problem-json":
          res.writeHead(200, { "content-type": "application/problem+json" });
          res.end("{}");
          return;
        case "/text":
          res.writeHead(200, { "content-type": "text/plain" });
          res.end("plain");
          return;
        case "/notype":
          res.writeHead(200);
          res.end("<html></html>");
          return;
        case "/relative":
          res.writeHead(301, { location: "html" });
          res.end();
          return;
        case "/to-private":
          res.writeHead(302, { location: "http://10.0.0.1/" });
          res.end();
          return;
        case "/to-evil-name":
          res.writeHead(302, { location: `http://evil.test:${port}/html` });
          res.end();
          return;
        case "/to-ftp":
          res.writeHead(302, { location: "ftp://example.org/file" });
          res.end();
          return;
        case "/hang":
          return;
        case "/drip": {
          res.writeHead(200, { "content-type": "text/html" });
          const timer = setInterval(() => res.write("a"), 100);
          req.on("close", () => clearInterval(timer));
          return;
        }
        case "/big-length":
          res.writeHead(200, { "content-type": "text/html", "content-length": String(bigBody.length) });
          res.end(bigBody);
          return;
        case "/big-chunked":
          res.writeHead(200, { "content-type": "text/html" });
          res.end(bigBody);
          return;
        case "/gzip-bomb":
          res.writeHead(200, { "content-type": "text/html", "content-encoding": "gzip" });
          res.end(bomb);
          return;
        case "/gzip-ok":
          res.writeHead(200, { "content-type": "text/html", "content-encoding": "gzip" });
          res.end(zlib.gzipSync(smallHtml));
          return;
        case "/br-ok":
          res.writeHead(200, { "content-type": "text/html", "content-encoding": "br" });
          res.end(zlib.brotliCompressSync(smallHtml));
          return;
        case "/latin1":
          res.writeHead(200, { "content-type": "text/html; charset=iso-8859-1" });
          res.end(Buffer.from([0x63, 0x61, 0x66, 0xe9]));
          return;
        case "/404":
          res.writeHead(404, { "content-type": "text/html" });
          res.end("gone");
          return;
        case "/500":
          res.writeHead(500, { "content-type": "text/html" });
          res.end("boom");
          return;
        case "/post": {
          let body = "";
          req.on("data", (c) => (body += c));
          req.on("end", () => {
            res.writeHead(200, { "content-type": "application/json" });
            res.end(JSON.stringify({ method: req.method, body }));
          });
          return;
        }
        case "/post-redirect":
          res.writeHead(307, { location: "/post" });
          res.end();
          return;
        default:
          res.writeHead(404);
          res.end();
      }
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    port = (server.address() as { port: number }).port;
    base = `http://127.0.0.1:${port}`;
  });

  afterAll(() => {
    server.close();
    server.closeAllConnections();
  });

  const loopbackOk: AddressPolicy = { allowAddress: (a) => a === "127.0.0.1" || isPublicAddress(a), allowPort: () => true };
  const names: Record<string, string[]> = {
    "public.test": ["127.0.0.1"],
    "evil.test": ["10.1.2.3"],
    "mixed.test": ["127.0.0.1", "10.0.0.9"],
  };
  const resolveHost: ResolveHost = async (hostname) => {
    const list = names[hostname];
    if (!list) throw Object.assign(new Error("ENOTFOUND"), { code: "ENOTFOUND" });
    return list.map((address) => ({ address, family: (address.includes(":") ? 6 : 4) as 4 | 6 }));
  };
  const t = { policy: loopbackOk, resolveHost };
  const code = (r: Awaited<ReturnType<typeof guardedFetch>>) => (r.ok ? `ok:${r.data.contentType}:${r.data.redirects}` : r.code);

  describe("default policy (no policy option given)", () => {
    it("blocks a loopback literal on a non-default port (blocked_port)", async () => {
      const result = await guardedFetch(`${base}/html`, { accept: "html" });
      expect(code(result)).toBe("blocked_port");
    });

    const literalCases: Array<[string, string]> = [
      ["http://127.0.0.1/html", "blocked_address"],
      ["http://localhost/html", "blocked_address"],
      ["http://[::1]/html", "blocked_address"],
      ["http://2130706433/html", "blocked_address"],
      ["http://0x7f.1/html", "blocked_address"],
      ["http://127.1/", "blocked_address"],
      ["http://[::ffff:127.0.0.1]/", "blocked_address"],
      ["http://[::ffff:7f00:1]/", "blocked_address"],
      ["http://169.254.169.254/latest/meta-data/", "blocked_address"],
      ["http://[fe80::1]/", "blocked_address"],
      ["http://[fd00::1]/", "blocked_address"],
    ];
    it.each(literalCases)("blocks the literal address in %s (%s)", async (url, expected) => {
      const result = await guardedFetch(url, { accept: "html" });
      expect(code(result)).toBe(expected);
    });

    const schemeCases: Array<[string, string]> = [
      ["ftp://example.org/", "blocked_scheme"],
      ["file:///etc/passwd", "blocked_scheme"],
      ["javascript:alert(1)", "blocked_scheme"],
    ];
    it.each(schemeCases)("blocks the scheme in %s (%s)", async (url, expected) => {
      const result = await guardedFetch(url, { accept: "html" });
      expect(code(result)).toBe(expected);
    });

    it("rejects credentials in the URL", async () => {
      const result = await guardedFetch("http://user:pw@example.org/", { accept: "html" });
      expect(code(result)).toBe("invalid_url");
    });

    it("rejects a string that is not a URL", async () => {
      const result = await guardedFetch("not a url", { accept: "html" });
      expect(code(result)).toBe("invalid_url");
    });

    it("never contacts the local server for any of the calls above", async () => {
      expect(hits["/html"] ?? 0).toBe(0);
    });
  });

  describe("against the local server, under a test policy that allows loopback", () => {
    it("returns an html body on 200", async () => {
      const result = await guardedFetch(`${base}/html`, { accept: "html", ...t });
      expect(code(result)).toBe("ok:html:0");
    });

    it("returns a json body on 200", async () => {
      const result = await guardedFetch(`${base}/json`, { accept: "json", ...t });
      expect(code(result)).toBe("ok:json:0");
    });

    it("accepts a +json content-type suffix", async () => {
      const result = await guardedFetch(`${base}/problem-json`, { accept: "json", ...t });
      expect(code(result)).toBe("ok:json:0");
    });

    it("rejects json when html was requested", async () => {
      const result = await guardedFetch(`${base}/json`, { accept: "html", ...t });
      expect(code(result)).toBe("unsupported_type");
    });

    it("rejects text/plain when html was requested", async () => {
      const result = await guardedFetch(`${base}/text`, { accept: "html", ...t });
      expect(code(result)).toBe("unsupported_type");
    });

    it("rejects a response with no content-type header", async () => {
      const result = await guardedFetch(`${base}/notype`, { accept: "html", ...t });
      expect(code(result)).toBe("unsupported_type");
    });

    it("follows up to 3 redirects", async () => {
      const result = await guardedFetch(`${base}/redirect/2`, { accept: "html", ...t });
      expect(code(result)).toBe("ok:html:3");
    });

    it("refuses a 4th redirect", async () => {
      const result = await guardedFetch(`${base}/redirect/3`, { accept: "html", ...t });
      expect(code(result)).toBe("too_many_redirects");
    });

    it("resolves a relative redirect Location against the current URL", async () => {
      const result = await guardedFetch(`${base}/relative`, { accept: "html", ...t });
      expect(code(result)).toBe("ok:html:1");
    });

    it("blocks a redirect to a private literal address", async () => {
      const result = await guardedFetch(`${base}/to-private`, { accept: "html", ...t });
      expect(code(result)).toBe("blocked_address");
    });

    it("blocks a redirect to a name that resolves to a private address, and never reaches the target host", async () => {
      const before = hits["/html"] ?? 0;
      const result = await guardedFetch(`${base}/to-evil-name`, { accept: "html", ...t });
      expect(code(result)).toBe("blocked_address");
      expect(hits["/html"] ?? 0).toBe(before);
    });

    it("blocks a redirect to ftp", async () => {
      const result = await guardedFetch(`${base}/to-ftp`, { accept: "html", ...t });
      expect(code(result)).toBe("blocked_scheme");
    });

    it("blocks a name that resolves to one private answer among several", async () => {
      const result = await guardedFetch(`http://mixed.test:${port}/html`, { accept: "html", ...t });
      expect(code(result)).toBe("blocked_address");
    });

    it("gives dns_failed for an unknown name", async () => {
      const result = await guardedFetch(`http://nowhere.test:${port}/html`, { accept: "html", ...t });
      expect(code(result)).toBe("dns_failed");
    });

    it("connects to the resolved address for a pinned name, and keeps the original Host header", async () => {
      hostHeaders.length = 0;
      const result = await guardedFetch(`http://public.test:${port}/html`, { accept: "html", ...t });
      expect(code(result)).toBe("ok:html:0");
      expect(hostHeaders[0]).toBe(`public.test:${port}`);
    });

    it("times out a server that never answers", async () => {
      const started = Date.now();
      const result = await guardedFetch(`${base}/hang`, { accept: "html", timeoutMs: 400, ...t });
      expect(code(result)).toBe("timeout");
      expect(Date.now() - started).toBeLessThan(1200);
    });

    it("times out a server that drips the body forever", async () => {
      const started = Date.now();
      const result = await guardedFetch(`${base}/drip`, { accept: "html", timeoutMs: 500, ...t });
      expect(code(result)).toBe("timeout");
      expect(Date.now() - started).toBeLessThan(1300);
    });

    it("rejects a declared Content-Length over the cap before reading the body", async () => {
      const result = await guardedFetch(`${base}/big-length`, { accept: "html", ...t });
      expect(code(result)).toBe("too_large");
    });

    it("rejects a chunked body over the cap", async () => {
      const result = await guardedFetch(`${base}/big-chunked`, { accept: "html", ...t });
      expect(code(result)).toBe("too_large");
    });

    it("counts the cap on decoded bytes, so a gzip bomb is rejected", async () => {
      const result = await guardedFetch(`${base}/gzip-bomb`, { accept: "html", ...t });
      expect(code(result)).toBe("too_large");
    });

    it("decodes a gzip body", async () => {
      const result = await guardedFetch(`${base}/gzip-ok`, { accept: "html", ...t });
      expect(code(result)).toBe("ok:html:0");
    });

    it("decodes a brotli body", async () => {
      const result = await guardedFetch(`${base}/br-ok`, { accept: "html", ...t });
      expect(code(result)).toBe("ok:html:0");
    });

    it("decodes a non-UTF-8 charset from the content-type header", async () => {
      const result = await guardedFetch(`${base}/latin1`, { accept: "html", ...t });
      expect(result.ok && result.data.body).toBe("café");
    });

    it("gives not_found for a 404", async () => {
      const result = await guardedFetch(`${base}/404`, { accept: "html", ...t });
      expect(code(result)).toBe("not_found");
    });

    it("gives http_error for a 500", async () => {
      const result = await guardedFetch(`${base}/500`, { accept: "html", ...t });
      expect(code(result)).toBe("http_error");
    });

    it("sends a POST body and method through to the server", async () => {
      const result = await guardedFetch(`${base}/post`, { accept: "json", method: "POST", body: '{"q":1}', ...t });
      expect(result.ok && JSON.parse(result.data.body)).toEqual({ method: "POST", body: '{"q":1}' });
    });

    it("never follows a redirect on POST", async () => {
      const result = await guardedFetch(`${base}/post-redirect`, { accept: "json", method: "POST", body: "{}", ...t });
      expect(code(result)).toBe("http_error");
    });

    it("gives network_error when the caller's own signal aborts", async () => {
      const controller = new AbortController();
      setTimeout(() => controller.abort(), 100);
      const result = await guardedFetch(`${base}/hang`, { accept: "html", signal: controller.signal, ...t });
      expect(code(result)).toBe("network_error");
    });
  });
});
