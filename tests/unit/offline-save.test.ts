import { describe, it, expect, vi } from "vitest";
import { deleteSaved, extractStaticUrls, planSave, readSavedMeta, saveForOffline } from "@/lib/offline/save";
import type { PrepManifest } from "@/lib/prep/manifest";

const ORIGIN = "https://jobs.test";
const keyOf = (req: Request | string) => new URL(typeof req === "string" ? req : req.url, ORIGIN).href;

class FakeCache {
  entries = new Map<string, Response>();
  async match(req: Request | string) {
    return this.entries.get(keyOf(req))?.clone();
  }
  async put(req: Request | string, res: Response) {
    this.entries.set(keyOf(req), res);
  }
}
class FakeCaches {
  stores = new Map<string, FakeCache>();
  async open(name: string) {
    let c = this.stores.get(name);
    if (!c) this.stores.set(name, (c = new FakeCache()));
    return c;
  }
  async has(name: string) {
    return this.stores.has(name);
  }
  async delete(name: string) {
    return this.stores.delete(name);
  }
  async keys() {
    return [...this.stores.keys()];
  }
}

function manifest(over: Partial<PrepManifest> = {}): PrepManifest {
  const plan = { title: "t", subtitle: "s", questions: [], steps: [] };
  return {
    version: 1,
    slug: "acme-designer",
    generatedAt: "2026-11-21T12:00:00Z",
    job: { roleTitle: "Designer", companyName: "Acme" },
    banks: [
      { key: "bank", title: "Bank", kind: "question_bank", stageLabel: null, questions: [], plan },
      { key: "card", title: "Card", kind: "call_card", stageLabel: "Call", questions: [], plan },
    ],
    pitches: [{ key: "pitch", title: "Pitch", plan }],
    settings: { speed: 1, gapFactor: 1, browserVoices: { interviewer: null, candidate: null } },
    assets: [
      { id: "a1", bytes: 1000 },
      { id: "a2", bytes: 2000 },
    ],
    totalBytes: 3000,
    ...over,
  };
}

const HTML = `<html><head><link rel="stylesheet" href="/_next/static/css/app.css"><link href="https://cdn.test/x.css" rel="stylesheet"></head>
<body><script src="/_next/static/chunks/main.js" async></script><a href="/board">board</a></body></html>`;

function makeFetch(m: PrepManifest, opts: { failing?: Set<string> } = {}) {
  const calls: { url: string; init?: RequestInit }[] = [];
  const fn = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    calls.push({ url, init });
    if (opts.failing?.has(url)) return new Response("nope", { status: 500 });
    if (url === `/api/prep/${m.slug}`) return new Response(JSON.stringify(m), { headers: { "Content-Type": "application/json" } });
    if (url.startsWith("/jobs/")) return new Response(HTML, { headers: { "Content-Type": "text/html" } });
    if (url.startsWith("/api/assets/")) return new Response("audio-" + url);
    if (url.startsWith("/_next/static/")) return new Response("static");
    return new Response("?", { status: 404 });
  });
  return { fn: fn as unknown as typeof fetch, calls, spy: fn };
}

type RunOver = { caches: FakeCaches; fetch: typeof fetch; onProgress?: (p: { done: number; total: number }) => void; signal?: AbortSignal };
const run = (over: RunOver) =>
  saveForOffline({ slug: "acme-designer", userHash: "aaaa", onProgress: () => {}, ...over, caches: over.caches as unknown as CacheStorage });

describe("planSave", () => {
  it("lists three pages per bank, one per pitch, the manifest URL and one asset URL per clip, with the byte total", () => {
    const plan = planSave(manifest());
    expect(plan.pages).toEqual([
      "/jobs/acme-designer/listen?doc=job:bank",
      "/jobs/acme-designer/drill?doc=job:bank",
      "/jobs/acme-designer/quick-fire?doc=job:bank",
      "/jobs/acme-designer/listen?doc=job:card",
      "/jobs/acme-designer/drill?doc=job:card",
      "/jobs/acme-designer/quick-fire?doc=job:card",
      "/jobs/acme-designer/listen?doc=job:pitch",
    ]);
    expect(plan.manifestUrl).toBe("/api/prep/acme-designer");
    expect(plan.assetUrls).toEqual(["/api/assets/a1", "/api/assets/a2"]);
    expect(plan.totalBytes).toBe(3000);
    expect(plan.clips).toBe(2);
  });
});

describe("saveForOffline", () => {
  it("stores the manifest, the pages, the static files and every clip in the job's cache and reports progress to done equal to total", async () => {
    const m = manifest();
    const { fn, calls } = makeFetch(m);
    const caches = new FakeCaches();
    const progress: { done: number; total: number }[] = [];
    const result = await run({ caches, fetch: fn, onProgress: (p) => progress.push(p) });
    expect(result.ok).toBe(true);
    expect(result.failed).toEqual([]);
    const cache = caches.stores.get("jobsmith-prep-aaaa-acme-designer")!;
    const stored = [...cache.entries.keys()].map((k) => k.replace(ORIGIN, ""));
    expect(stored).toContain("/api/prep/acme-designer");
    expect(stored).toContain("/jobs/acme-designer/drill?doc=job:card");
    expect(stored).toContain("/api/assets/a2");
    expect(stored).toContain("/__saved-meta");
    expect(stored).toHaveLength(1 + 7 + 2 + 1);
    // Static files go through fetch (the worker stores them), once each.
    expect(calls.filter((c) => c.url.startsWith("/_next/static/")).map((c) => c.url).sort()).toEqual([
      "/_next/static/chunks/main.js",
      "/_next/static/css/app.css",
    ]);
    const last = progress[progress.length - 1];
    expect(last.done).toBe(last.total);
    expect(last.total).toBe(1 + 7 + 2 + 2);
    expect(progress.every((p) => p.done <= p.total)).toBe(true);
    expect(progress.map((p) => p.done)).toEqual([...progress.map((p) => p.done)].sort((a, b) => a - b));
  });

  it("a retry skips what is already cached", async () => {
    const m = manifest();
    const caches = new FakeCaches();
    const failing = new Set(["/api/assets/a2"]);
    const first = makeFetch(m, { failing });
    const r1 = await run({ caches, fetch: first.fn });
    expect(r1.ok).toBe(false);
    const second = makeFetch(m);
    const r2 = await run({ caches, fetch: second.fn });
    expect(r2.ok).toBe(true);
    const urls = second.calls.map((c) => c.url);
    // The manifest is refetched and the failed clip fetched; pages and a1 are not.
    expect(urls.filter((u) => u.startsWith("/jobs/"))).toEqual([]);
    expect(urls).toContain("/api/assets/a2");
    expect(urls).not.toContain("/api/assets/a1");
    expect(urls.filter((u) => u === "/api/prep/acme-designer")).toHaveLength(1);
  });

  it("a failing asset is reported in failed and no saved meta is written", async () => {
    const m = manifest();
    const caches = new FakeCaches();
    const { fn } = makeFetch(m, { failing: new Set(["/api/assets/a1"]) });
    const result = await run({ caches, fetch: fn });
    expect(result.ok).toBe(false);
    expect(result.failed).toEqual(["/api/assets/a1"]);
    expect(await readSavedMeta(caches as unknown as CacheStorage, "aaaa", "acme-designer")).toBeNull();
    const cache = caches.stores.get("jobsmith-prep-aaaa-acme-designer")!;
    expect(await cache.match("/api/assets/a2")).toBeDefined();
  });

  it("a failed manifest ends the save at once, and a redirect (a lapsed session) counts as a failure", async () => {
    const m = manifest();
    const { fn } = makeFetch(m, { failing: new Set(["/api/prep/acme-designer"]) });
    const result = await run({ caches: new FakeCaches(), fetch: fn });
    expect(result).toMatchObject({ ok: false, failed: ["/api/prep/acme-designer"] });

    const redirected = vi.fn(async () => {
      const res = new Response(JSON.stringify(m));
      Object.defineProperty(res, "redirected", { value: true });
      return res;
    });
    const r2 = await run({ caches: new FakeCaches(), fetch: redirected as unknown as typeof fetch });
    expect(r2.ok).toBe(false);
  });

  it("it fetches with credentials include and never sends data anywhere but the app's own origin", async () => {
    const m = manifest();
    const { fn, calls } = makeFetch(m);
    await run({ caches: new FakeCaches(), fetch: fn });
    expect(calls.length).toBeGreaterThan(10);
    for (const call of calls) {
      expect(call.init?.credentials).toBe("include");
      expect(call.url.startsWith("/")).toBe(true); // a path: always the page's own origin
      expect(call.url.startsWith("//")).toBe(false);
      expect(call.init?.method ?? "GET").toBe("GET");
      expect(call.init?.body).toBeUndefined();
    }
    expect(calls.map((c) => c.url).some((u) => u.includes("cdn.test"))).toBe(false);
  });

  it("an aborted save rejects with the abort reason", async () => {
    const m = manifest();
    const controller = new AbortController();
    const { fn } = makeFetch(m);
    const wrapped = (async (input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input).startsWith("/jobs/")) controller.abort();
      return fn(input, init);
    }) as typeof fetch;
    await expect(run({ caches: new FakeCaches(), fetch: wrapped, signal: controller.signal })).rejects.toBeDefined();
  });
});

describe("saved meta", () => {
  it("readSavedMeta returns the date, clip count and bytes once saved and null before", async () => {
    const m = manifest();
    const caches = new FakeCaches();
    const cs = caches as unknown as CacheStorage;
    expect(await readSavedMeta(cs, "aaaa", "acme-designer")).toBeNull();
    expect(await caches.keys()).toEqual([]); // reading does not create a cache
    const { fn } = makeFetch(m);
    const result = await run({ caches, fetch: fn });
    const meta = await readSavedMeta(cs, "aaaa", "acme-designer");
    expect(meta).toEqual({ savedAt: result.savedAt, clips: 2, bytes: 3000 });
  });

  it("deleteSaved removes the job's cache only, not another job's or another user's", async () => {
    const caches = new FakeCaches();
    for (const n of ["jobsmith-prep-aaaa-one", "jobsmith-prep-aaaa-two", "jobsmith-prep-bbbb-one", "jobsmith-shell-b1"]) await caches.open(n);
    await deleteSaved(caches as unknown as CacheStorage, "aaaa", "one");
    expect((await caches.keys()).sort()).toEqual(["jobsmith-prep-aaaa-two", "jobsmith-prep-bbbb-one", "jobsmith-shell-b1"]);
  });
});

describe("extractStaticUrls", () => {
  it("finds /_next/static URLs in script src and link href and ignores other URLs", () => {
    expect(extractStaticUrls(HTML).sort()).toEqual(["/_next/static/chunks/main.js", "/_next/static/css/app.css"]);
    expect(extractStaticUrls(`<img src='/_next/static/media/f.woff2'><a href="/board"><script src="https://x.test/_next/static/a.js">`)).toEqual([
      "/_next/static/media/f.woff2",
    ]);
    expect(extractStaticUrls("<p>/_next/static/not-an-attribute.js</p>")).toEqual([]);
  });
});
