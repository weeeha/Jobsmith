import http from "node:http";
import https from "node:https";
import dns from "node:dns";
import net from "node:net";
import zlib from "node:zlib";
import type { Readable } from "node:stream";
import type { Result } from "@/lib/result";
import { ok, fail } from "@/lib/result";
import { DEFAULT_POLICY, type AddressPolicy } from "./address-policy";

export const FETCH_TIMEOUT_MS = 8_000;
export const FETCH_MAX_BYTES = 2 * 1024 * 1024;
export const FETCH_MAX_REDIRECTS = 3;

export const FETCH_FAILURES = [
  "invalid_url",
  "blocked_scheme",
  "blocked_port",
  "blocked_address",
  "dns_failed",
  "too_many_redirects",
  "timeout",
  "too_large",
  "unsupported_type",
  "not_found",
  "http_error",
  "network_error",
] as const;
export type FetchFailure = (typeof FETCH_FAILURES)[number];

export type ResolveHost = (hostname: string) => Promise<{ address: string; family: 4 | 6 }[]>;

export type GuardOptions = {
  accept: "html" | "json";
  method?: "GET" | "POST";
  body?: string;
  headers?: Record<string, string>;
  signal?: AbortSignal;
  timeoutMs?: number;
  maxBytes?: number;
  maxRedirects?: number;
  resolveHost?: ResolveHost;
  policy?: AddressPolicy;
};

export type GuardedResponse = { url: string; status: number; contentType: "html" | "json"; body: string; redirects: number };
export type GuardedFetch = (url: string, options: GuardOptions) => Promise<Result<GuardedResponse, FetchFailure>>;

const defaultResolve: ResolveHost = async (hostname) => {
  const rows = await dns.promises.lookup(hostname, { all: true, verbatim: true });
  return rows.map((r) => ({ address: r.address, family: r.family === 6 ? 6 : 4 }));
};

class GuardError extends Error {
  constructor(readonly code: FetchFailure) {
    super(code);
  }
}

function pinnedLookup(resolveHost: ResolveHost, policy: AddressPolicy): net.LookupFunction {
  return ((hostname: string, options: dns.LookupOptions, callback: (...args: unknown[]) => void) => {
    resolveHost(hostname)
      .then((addresses) => {
        if (addresses.length === 0) throw new GuardError("dns_failed");
        // Every answer must pass: a name that also resolves to a disallowed
        // address is refused outright, even if one of its other answers is
        // fine (otherwise a caller could connect through the one allowed
        // answer while a second, disallowed answer goes unnoticed).
        if (addresses.some((a) => !policy.allowAddress(a.address))) throw new GuardError("blocked_address");
        if (options.all) {
          callback(null, addresses);
        } else {
          const wanted = options.family === 6 ? 6 : options.family === 4 ? 4 : undefined;
          const pick = addresses.find((a) => wanted === undefined || a.family === wanted) ?? addresses[0]!;
          callback(null, pick.address, pick.family);
        }
      })
      .catch((error: unknown) => {
        const coded = error instanceof GuardError ? error : Object.assign(new GuardError("dns_failed"), { cause: error });
        callback(coded, options.all ? [] : "", 4);
      });
  }) as unknown as net.LookupFunction;
}

function mediaType(header: string | undefined): string | null {
  if (!header) return null;
  return header.split(";")[0]!.trim().toLowerCase() || null;
}

function charsetOf(header: string | undefined): string {
  const match = header ? /charset\s*=\s*"?([^";\s]+)"?/i.exec(header) : null;
  return match ? match[1]!.toLowerCase() : "utf-8";
}

function kindOf(type: string | null): "html" | "json" | null {
  if (type === "text/html" || type === "application/xhtml+xml") return "html";
  if (type === "application/json" || (type !== null && /^application\/[a-z0-9.+-]+\+json$/.test(type))) return "json";
  return null;
}

function decoderFor(encoding: string | undefined): (Readable & NodeJS.WritableStream) | null | "unsupported" {
  const value = (encoding ?? "identity").trim().toLowerCase();
  if (value === "identity" || value === "") return null;
  if (value === "gzip" || value === "x-gzip") return zlib.createGunzip();
  if (value === "deflate") return zlib.createInflate();
  if (value === "br") return zlib.createBrotliDecompress();
  return "unsupported";
}

function hostForCheck(url: URL): string {
  return url.hostname.startsWith("[") ? url.hostname.slice(1, -1) : url.hostname;
}

function portOf(url: URL): number {
  if (url.port) return Number(url.port);
  return url.protocol === "https:" ? 443 : 80;
}

type Hop = { status: number; location: string | null; type: string | null; charset: string; body: string | null };

function oneHop(url: URL, options: GuardOptions, policy: AddressPolicy, resolveHost: ResolveHost, signal: AbortSignal, maxBytes: number): Promise<Hop> {
  return new Promise<Hop>((resolve, reject) => {
    const client = url.protocol === "https:" ? https : http;
    const host = hostForCheck(url);
    const request = client.request(
      {
        protocol: url.protocol,
        hostname: host,
        port: portOf(url),
        path: `${url.pathname}${url.search}`,
        method: options.method ?? "GET",
        agent: false,
        lookup: pinnedLookup(resolveHost, policy),
        signal,
        headers: {
          "user-agent": "Mozilla/5.0 (compatible; Jobsmith)",
          accept: options.accept === "json" ? "application/json" : "text/html,application/xhtml+xml",
          "accept-encoding": "gzip, deflate, br",
          ...(options.body !== undefined ? { "content-type": "application/json" } : {}),
          ...options.headers,
        },
      },
      (response) => {
        const status = response.statusCode ?? 0;
        const location = typeof response.headers.location === "string" ? response.headers.location : null;
        const type = mediaType(response.headers["content-type"]);
        const charset = charsetOf(response.headers["content-type"]);
        if ((status >= 300 && status < 400) || status < 200 || status >= 300 || kindOf(type) !== options.accept) {
          response.resume();
          resolve({ status, location, type, charset, body: null });
          return;
        }
        const declared = Number(response.headers["content-length"] ?? NaN);
        if (Number.isFinite(declared) && declared > maxBytes) {
          response.destroy();
          reject(new GuardError("too_large"));
          return;
        }
        const decoder = decoderFor(response.headers["content-encoding"]);
        if (decoder === "unsupported") {
          response.destroy();
          reject(new GuardError("unsupported_type"));
          return;
        }
        const stream: Readable = decoder ? response.pipe(decoder) : response;
        const chunks: Buffer[] = [];
        let total = 0;
        // The cap applies to decoded bytes: counting on `stream` (the output
        // of the decoder, when there is one) rather than the raw `response`
        // is what stops a gzip bomb.
        stream.on("data", (chunk: Buffer) => {
          total += chunk.length;
          if (total > maxBytes) {
            response.destroy();
            if (decoder) decoder.destroy();
            reject(new GuardError("too_large"));
            return;
          }
          chunks.push(chunk);
        });
        stream.on("end", () => {
          let text: string;
          try {
            text = new TextDecoder(charset).decode(Buffer.concat(chunks));
          } catch {
            text = new TextDecoder("utf-8").decode(Buffer.concat(chunks));
          }
          resolve({ status, location, type, charset, body: text });
        });
        stream.on("error", reject);
        response.on("error", reject);
      },
    );
    request.on("error", reject);
    if (options.body !== undefined) request.write(options.body);
    request.end();
  });
}

export const guardedFetch: GuardedFetch = async (rawUrl, options) => {
  const policy = options.policy ?? DEFAULT_POLICY;
  const resolveHost = options.resolveHost ?? defaultResolve;
  const maxRedirects = options.maxRedirects ?? FETCH_MAX_REDIRECTS;
  const maxBytes = options.maxBytes ?? FETCH_MAX_BYTES;
  const timeout = AbortSignal.timeout(options.timeoutMs ?? FETCH_TIMEOUT_MS);
  const signal = options.signal ? AbortSignal.any([timeout, options.signal]) : timeout;

  if (!URL.canParse(rawUrl)) return fail("invalid_url", "invalid_url");
  let url = new URL(rawUrl);
  let redirects = 0;

  for (;;) {
    if (url.protocol !== "http:" && url.protocol !== "https:") return fail("blocked_scheme", "blocked_scheme");
    if (url.username || url.password) return fail("invalid_url", "invalid_url");
    if (!policy.allowPort(portOf(url))) return fail("blocked_port", "blocked_port");
    const host = hostForCheck(url);
    // An address literal never reaches the lookup hook (Node's own
    // connection logic skips DNS resolution when the hostname is already an
    // IP), so it is checked here instead, before any connection is made.
    if (net.isIP(host) !== 0 && !policy.allowAddress(host)) return fail("blocked_address", "blocked_address");

    let hop: Hop;
    try {
      hop = await oneHop(url, options, policy, resolveHost, signal, maxBytes);
    } catch (error) {
      if (timeout.aborted) return fail("timeout", "timeout");
      if (error instanceof GuardError) return fail(error.code, error.code);
      return fail("network_error", "network_error");
    }

    if (hop.status >= 300 && hop.status < 400 && hop.location) {
      if ((options.method ?? "GET") !== "GET") return fail("http_error", "http_error");
      if (redirects >= maxRedirects) return fail("too_many_redirects", "too_many_redirects");
      if (!URL.canParse(hop.location, url)) return fail("invalid_url", "invalid_url");
      url = new URL(hop.location, url);
      redirects += 1;
      continue;
    }
    if (hop.status === 404 || hop.status === 410) return fail("not_found", "not_found");
    if (hop.status < 200 || hop.status >= 300) return fail("http_error", "http_error");
    const kind = kindOf(hop.type);
    if (kind === null || kind !== options.accept || hop.body === null) return fail("unsupported_type", "unsupported_type");
    return ok({ url: url.toString(), status: hop.status, contentType: kind, body: hop.body, redirects });
  }
};
