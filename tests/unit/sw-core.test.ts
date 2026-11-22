import { describe, it, expect, vi } from "vitest";
import { createRequire } from "node:module";
import path from "node:path";

type Core = {
  classifyRequest(url: string, method: string, mode: string): string;
  normalizePageKey(url: string): string;
  shellCacheName(buildId: string): string;
  prepCacheName(userHash: string, slug: string): string;
  isPrepCacheOf(name: string, userHash: string): boolean;
  clearUserCaches(cachesApi: FakeCaches, userHash: string): Promise<string[]>;
  buildIdFromUrl(href: string): string;
  rangeResponse(response: Response, range: string | null): Promise<Response>;
  route(request: Request, deps: Deps): Promise<Response> | null;
  onInstall(deps: Deps): Promise<unknown>;
  extractStaticUrls(html: string): string[];
  onActivate(deps: Deps): Promise<unknown>;
};
type Deps = { caches: FakeCaches; fetch: (request: Request) => Promise<Response>; buildId: string };

const swPath = path.resolve(import.meta.dirname, "../../public/sw.js");
const require_ = createRequire(import.meta.url);
function loadCore(): Core {
  delete require_.cache[swPath];
  return require_(swPath) as Core;
}
const core = loadCore();

const ORIGIN = "https://jobs.test";

// Like the real Cache, a relative string key is resolved against the origin.
const keyOf = (req: Request | string) => new URL(typeof req === "string" ? req : req.url, ORIGIN).href;

class FakeCache {
  entries = new Map<string, Response>();
  async match(req: Request | string): Promise<Response | undefined> {
    const hit = this.entries.get(keyOf(req));
    return hit?.clone();
  }
  async put(req: Request | string, res: Response): Promise<void> {
    this.entries.set(keyOf(req), res);
  }
  async add(url: string): Promise<void> {
    this.entries.set(new URL(url, ORIGIN).href, new Response(`page ${url}`));
  }
}
class FakeCaches {
  stores = new Map<string, FakeCache>();
  async open(name: string): Promise<FakeCache> {
    let c = this.stores.get(name);
    if (!c) this.stores.set(name, (c = new FakeCache()));
    return c;
  }
  async keys(): Promise<string[]> {
    return [...this.stores.keys()];
  }
  async delete(name: string): Promise<boolean> {
    return this.stores.delete(name);
  }
}

function makeDeps(fetchImpl: (r: Request) => Promise<Response>): Deps {
  return { caches: new FakeCaches(), fetch: fetchImpl, buildId: "b1" };
}
const offline = () => Promise.reject(new TypeError("offline"));
function req(pathAndQuery: string, init: { method?: string; mode?: RequestMode; headers?: Record<string, string> } = {}): Request {
  const r = new Request(ORIGIN + pathAndQuery, { method: init.method ?? "GET", headers: init.headers });
  // The Request constructor does not let a script choose "navigate"; fake the mode.
  Object.defineProperty(r, "mode", { value: init.mode ?? "cors" });
  return r;
}
const text = async (p: Promise<Response> | null) => (await p!).text();

describe("classifyRequest", () => {
  it("sorts assets, the prep manifest, the three player pages, static files, documents and everything else", () => {
    expect(core.classifyRequest("/api/assets/abc", "GET", "cors")).toBe("asset");
    expect(core.classifyRequest("/api/prep/acme-designer", "GET", "cors")).toBe("manifest");
    for (const leaf of ["listen", "drill", "quick-fire"]) {
      expect(core.classifyRequest(`/jobs/acme/${leaf}?doc=job:x`, "GET", "navigate")).toBe("player-page");
    }
    expect(core.classifyRequest("/_next/static/chunks/a.js", "GET", "no-cors")).toBe("static");
    expect(core.classifyRequest("/board", "GET", "navigate")).toBe("navigation");
    expect(core.classifyRequest("/board", "GET", "cors")).toBe("other");
    expect(core.classifyRequest("/api/assets", "GET", "cors")).toBe("other");
    expect(core.classifyRequest("/api/bridge/opportunities", "GET", "cors")).toBe("other");
    expect(core.classifyRequest("/api/auth/get-session", "GET", "cors")).toBe("other");
    expect(core.classifyRequest("/jobs/acme/listen/extra", "GET", "navigate")).toBe("navigation");
  });

  it("a POST to an asset or a page is 'other'", () => {
    expect(core.classifyRequest("/api/assets/abc", "POST", "cors")).toBe("other");
    expect(core.classifyRequest("/jobs/acme/listen", "POST", "navigate")).toBe("other");
  });

  it("a client-side navigation fetch (not a document load) of a player page is 'other'", () => {
    expect(core.classifyRequest("/jobs/acme/listen?_rsc=1", "GET", "cors")).toBe("other");
  });
});

describe("normalizePageKey", () => {
  it("ignores q on /listen and n, section and only on /drill and keeps doc", () => {
    expect(core.normalizePageKey("/jobs/a/listen?doc=job:k&q=x")).toBe("/jobs/a/listen?doc=job:k");
    expect(core.normalizePageKey("/jobs/a/drill?n=5&section=Craft&only=shaky&doc=job:k")).toBe("/jobs/a/drill?doc=job:k");
    expect(core.normalizePageKey("/jobs/a/quick-fire?doc=job:k&seed=3")).toBe("/jobs/a/quick-fire?doc=job:k");
    expect(core.normalizePageKey("/jobs/a/listen?q=only")).toBe("/jobs/a/listen");
    expect(core.normalizePageKey("https://jobs.test/jobs/a/drill?doc=job:k&n=2")).toBe("/jobs/a/drill?doc=job:k");
  });
});

describe("cache names", () => {
  it("are jobsmith-shell-<build> and jobsmith-prep-<userHash>-<slug>, and isPrepCacheOf matches only that user hash", () => {
    expect(core.shellCacheName("b1")).toBe("jobsmith-shell-b1");
    expect(core.prepCacheName("aaaa", "acme")).toBe("jobsmith-prep-aaaa-acme");
    expect(core.isPrepCacheOf("jobsmith-prep-aaaa-acme", "aaaa")).toBe(true);
    expect(core.isPrepCacheOf("jobsmith-prep-aaaab-acme", "aaaa")).toBe(false);
    expect(core.isPrepCacheOf("jobsmith-shell-aaaa-acme", "aaaa")).toBe(false);
  });

  it("clearUserCaches deletes only that user's prep caches and returns their names", async () => {
    const caches = new FakeCaches();
    for (const n of ["jobsmith-prep-aaaa-one", "jobsmith-prep-aaaa-two", "jobsmith-prep-bbbb-one", "jobsmith-shell-b1"]) await caches.open(n);
    const deleted = await core.clearUserCaches(caches, "aaaa");
    expect(deleted.sort()).toEqual(["jobsmith-prep-aaaa-one", "jobsmith-prep-aaaa-two"]);
    expect(await caches.keys()).toEqual(["jobsmith-prep-bbbb-one", "jobsmith-shell-b1"]);
  });
});

describe("lifecycle", () => {
  it("install precaches /offline; activate deletes shell caches of other builds and keeps the current one and prep caches", async () => {
    const deps = makeDeps(offline);
    await core.onInstall(deps);
    expect((await (await deps.caches.open("jobsmith-shell-b1")).match(ORIGIN + "/offline"))?.status).toBe(200);
    await deps.caches.open("jobsmith-shell-old");
    await deps.caches.open("jobsmith-prep-aaaa-acme");
    await core.onActivate(deps);
    expect((await deps.caches.keys()).sort()).toEqual(["jobsmith-prep-aaaa-acme", "jobsmith-shell-b1"]);
  });
});

describe("install and the offline page's own files", () => {
  const HTML = '<html><link rel="stylesheet" href="/_next/static/css/a.css"><script src="/_next/static/chunks/offline.js" async></script><a href="/board">b</a></html>';

  it("extractStaticUrls returns only the /_next/static files of a page", () => {
    expect(core.extractStaticUrls(HTML)).toEqual(["/_next/static/css/a.css", "/_next/static/chunks/offline.js"]);
  });

  it("install also stores the offline page's static files, so the page can start with no network", async () => {
    const fetchSpy = vi.fn(async (r: Request | string) => new Response(`file ${typeof r === "string" ? r : r.url}`));
    const deps = makeDeps(fetchSpy as unknown as Deps["fetch"]);
    const shell = await deps.caches.open("jobsmith-shell-b1");
    shell.add = async (url: string) => {
      shell.entries.set(new URL(url, ORIGIN).href, new Response(HTML));
    };
    await core.onInstall(deps);
    expect((await shell.match(ORIGIN + "/_next/static/chunks/offline.js"))?.status).toBe(200);
    expect((await shell.match(ORIGIN + "/_next/static/css/a.css"))?.status).toBe(200);
  });

  it("a static file that fails to download does not fail the install", async () => {
    const deps = makeDeps(offline);
    const shell = await deps.caches.open("jobsmith-shell-b1");
    shell.add = async (url: string) => {
      shell.entries.set(new URL(url, ORIGIN).href, new Response(HTML));
    };
    await expect(core.onInstall(deps)).resolves.not.toThrow();
    expect((await shell.match(ORIGIN + "/offline"))?.status).toBe(200);
  });
});

describe("routing", () => {
  it("an asset request is answered from a prep cache when present and falls to the network when not, without storing it", async () => {
    const fetchSpy = vi.fn(async () => new Response("net"));
    const deps = makeDeps(fetchSpy);
    expect(await text(core.route(req("/api/assets/c1"), deps))).toBe("net");
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect((await deps.caches.keys()).filter((n) => n.startsWith("jobsmith-prep-"))).toEqual([]);

    await (await deps.caches.open("jobsmith-prep-aaaa-acme")).put(ORIGIN + "/api/assets/c1", new Response("cached"));
    expect(await text(core.route(req("/api/assets/c1"), deps))).toBe("cached");
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("a cached asset answers a Range request with a 206 slice", async () => {
    const deps = makeDeps(offline);
    await (await deps.caches.open("jobsmith-prep-aaaa-acme")).put(
      ORIGIN + "/api/assets/c1",
      new Response("0123456789", { headers: { "Content-Type": "audio/mpeg" } }),
    );
    const res = await core.route(req("/api/assets/c1", { headers: { Range: "bytes=2-5" } }), deps)!;
    expect(res.status).toBe(206);
    expect(await res.text()).toBe("2345");
    expect(res.headers.get("Content-Range")).toBe("bytes 2-5/10");
    expect(res.headers.get("Content-Type")).toBe("audio/mpeg");
    const tail = await core.route(req("/api/assets/c1", { headers: { Range: "bytes=7-" } }), deps)!;
    expect(await tail.text()).toBe("789");
    const bad = await core.route(req("/api/assets/c1", { headers: { Range: "bytes=50-60" } }), deps)!;
    expect(bad.status).toBe(416);
  });

  it("a player page goes network-first and falls back to its cached copy when the network fails", async () => {
    const online = makeDeps(async () => new Response("fresh"));
    expect(await text(core.route(req("/jobs/acme/listen?doc=job:k", { mode: "navigate" }), online))).toBe("fresh");

    const deps = makeDeps(offline);
    await (await deps.caches.open("jobsmith-prep-aaaa-acme")).put(ORIGIN + "/jobs/acme/listen?doc=job:k", new Response("saved page"));
    // A different q still finds the saved copy through the normalized key.
    expect(await text(core.route(req("/jobs/acme/listen?doc=job:k&q=zzz", { mode: "navigate" }), deps))).toBe("saved page");
  });

  it("a successful player-page fetch refreshes an existing cached copy and does not create one", async () => {
    const deps = makeDeps(async () => new Response("v2"));
    const url = ORIGIN + "/jobs/acme/drill?doc=job:k";
    expect(await text(core.route(req("/jobs/acme/drill?doc=job:k", { mode: "navigate" }), deps))).toBe("v2");
    expect((await deps.caches.keys()).filter((n) => n.startsWith("jobsmith-prep-"))).toEqual([]);

    const cache = await deps.caches.open("jobsmith-prep-aaaa-acme");
    await cache.put(url, new Response("v1"));
    await core.route(req("/jobs/acme/drill?doc=job:k", { mode: "navigate" }), deps);
    expect(await (await cache.match(url))!.text()).toBe("v2");
  });

  it("the prep manifest goes network-first with the prep cache as fallback", async () => {
    const deps = makeDeps(offline);
    await (await deps.caches.open("jobsmith-prep-aaaa-acme")).put(ORIGIN + "/api/prep/acme", new Response("{\"saved\":true}"));
    expect(await text(core.route(req("/api/prep/acme"), deps))).toBe("{\"saved\":true}");
  });

  it("an error or redirected response is not stored over a saved page", async () => {
    const deps = makeDeps(async () => new Response("denied", { status: 500 }));
    const cache = await deps.caches.open("jobsmith-prep-aaaa-acme");
    const url = ORIGIN + "/jobs/acme/listen?doc=job:k";
    await cache.put(url, new Response("v1"));
    const res = await core.route(req("/jobs/acme/listen?doc=job:k", { mode: "navigate" }), deps)!;
    expect(res.status).toBe(500);
    expect(await (await cache.match(url))!.text()).toBe("v1");
  });

  it("a static file is cache-first in the shell cache and stored on first fetch", async () => {
    const fetchSpy = vi.fn(async () => new Response("js"));
    const deps = makeDeps(fetchSpy);
    expect(await text(core.route(req("/_next/static/chunks/a.js"), deps))).toBe("js");
    expect(await text(core.route(req("/_next/static/chunks/a.js"), deps))).toBe("js");
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(await deps.caches.keys()).toEqual(["jobsmith-shell-b1"]);
  });

  it("a failed navigation to an uncached page returns the cached /offline page", async () => {
    const deps = makeDeps(offline);
    await core.onInstall(deps);
    expect(await text(core.route(req("/board", { mode: "navigate" }), deps))).toBe("page /offline");
    // A saved job's player page that was never saved falls back the same way.
    expect(await text(core.route(req("/jobs/zzz/listen?doc=job:k", { mode: "navigate" }), deps))).toBe("page /offline");
  });

  it("the board, Home and other API responses are never cached", async () => {
    const deps = makeDeps(async () => new Response("data"));
    await core.route(req("/board", { mode: "navigate" }), deps);
    await core.route(req("/", { mode: "navigate" }), deps);
    expect(core.route(req("/api/bridge/context"), deps)).toBeNull();
    expect(core.route(req("/api/auth/get-session"), deps)).toBeNull();
    expect(await deps.caches.keys()).toEqual([]);
  });

  it("a request in the 'other' class is not handled: respondWith is never called", async () => {
    const listeners = captureListeners();
    const respondWith = vi.fn();
    for (const r of [req("/api/bridge/x"), req("/jobs/acme/listen", { method: "POST", mode: "navigate" }), req("/board")]) {
      listeners.fetch({ request: r, respondWith });
    }
    expect(respondWith).not.toHaveBeenCalled();
    // And a request it does own is answered.
    listeners.fetch({ request: req("/api/assets/c1"), respondWith });
    expect(respondWith).toHaveBeenCalledTimes(1);
  });

  it("a cross-origin request is not handled", () => {
    const listeners = captureListeners();
    const respondWith = vi.fn();
    listeners.fetch({ request: new Request("https://cdn.test/api/assets/c1"), respondWith });
    expect(respondWith).not.toHaveBeenCalled();
  });
});

function captureListeners(href = ORIGIN + "/sw.js?build=zz9"): Record<string, (event: unknown) => void> {
  const handlers: Record<string, (event: unknown) => void> = {};
  const fake = {
    addEventListener: (type: string, fn: (event: unknown) => void) => {
      handlers[type] = fn;
    },
    location: { href, origin: ORIGIN },
    caches: new FakeCaches(),
    fetch: async () => new Response("x"),
    skipWaiting: vi.fn(async () => undefined),
    clients: { claim: vi.fn(async () => undefined) },
  };
  vi.stubGlobal("self", fake);
  try {
    const fresh = loadCore();
    expect(fresh).toBeDefined();
  } finally {
    vi.unstubAllGlobals();
  }
  (handlers as { __self?: unknown }).__self = fake;
  return handlers;
}

describe("worker wiring", () => {
  it("the build id is read from the worker's own URL query", () => {
    expect(core.buildIdFromUrl(ORIGIN + "/sw.js?build=abc123")).toBe("abc123");
    expect(core.buildIdFromUrl(ORIGIN + "/sw.js")).toBe("dev");
    const handlers = captureListeners(ORIGIN + "/sw.js?build=zz9");
    const waitUntil = vi.fn();
    handlers.install({ waitUntil });
    const self_ = (handlers as unknown as { __self: { caches: FakeCaches } }).__self;
    return waitUntil.mock.calls[0][0].then(async () => {
      expect(await self_.caches.keys()).toEqual(["jobsmith-shell-zz9"]);
    });
  });

  it("a clear-user message deletes that user's caches and answers on the port", async () => {
    const handlers = captureListeners();
    const self_ = (handlers as unknown as { __self: { caches: FakeCaches } }).__self;
    await self_.caches.open("jobsmith-prep-aaaa-acme");
    await self_.caches.open("jobsmith-prep-bbbb-acme");
    const postMessage = vi.fn();
    const waitUntil = vi.fn();
    handlers.message({ data: { type: "clear-user", userHash: "aaaa" }, ports: [{ postMessage }], waitUntil });
    await waitUntil.mock.calls[0][0];
    expect(postMessage).toHaveBeenCalledWith({ ok: true, deleted: ["jobsmith-prep-aaaa-acme"] });
    expect(await self_.caches.keys()).toEqual(["jobsmith-prep-bbbb-acme"]);
  });

  it("an unrelated message is ignored", () => {
    const handlers = captureListeners();
    const waitUntil = vi.fn();
    handlers.message({ data: { type: "hello" }, ports: [], waitUntil });
    expect(waitUntil).not.toHaveBeenCalled();
  });

  it("loading the file without a worker scope registers nothing and does not throw", () => {
    expect(() => loadCore()).not.toThrow();
  });
});
