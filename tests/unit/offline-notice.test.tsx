// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import { OfflineNotice } from "@/components/offline/offline-notice";
import { OFFLINE_COPY } from "@/lib/offline/copy";
import { SAVED_META_PATH, prepCacheName } from "@/lib/offline/names";
import OfflinePage from "@/app/offline/page";

class FakeCache {
  entries = new Map<string, Response>();
  async match(key: string) {
    return this.entries.get(key)?.clone();
  }
  async put(key: string, res: Response) {
    this.entries.set(key, res);
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
  async keys() {
    return [...this.stores.keys()];
  }
}

async function saveJob(caches: FakeCaches, slug: string, banks: { key: string; title: string }[], pitches: { key: string; title: string }[] = []) {
  const cache = await caches.open(prepCacheName("aaaa", slug));
  const manifest = { slug, job: { roleTitle: "Designer", companyName: slug.toUpperCase() }, banks, pitches };
  await cache.put(`/api/prep/${slug}`, new Response(JSON.stringify(manifest)));
  await cache.put(SAVED_META_PATH, new Response(JSON.stringify({ savedAt: "2026-11-20T09:00:00Z", clips: 1, bytes: 1 })));
}

afterEach(cleanup);

describe("OfflineNotice", () => {
  it("lists each saved job with links to its Listen, Drill and Quick-fire pages, under 'Open a saved job'", async () => {
    const caches = new FakeCaches();
    await saveJob(caches, "acme", [{ key: "answers-full", title: "Full answers" }], [{ key: "pitch", title: "Pitch" }]);
    await saveJob(caches, "globex", [{ key: "bank", title: "Bank" }]);
    render(<OfflineNotice deps={{ caches: caches as unknown as CacheStorage }} />);
    expect(screen.getByText("You are offline.")).toBeTruthy();
    expect(await screen.findByRole("heading", { name: "Open a saved job" })).toBeTruthy();
    const acme = screen.getByRole("group", { name: "Designer at ACME" });
    const hrefOf = (name: string) => within(acme).getByRole("link", { name }).getAttribute("href");
    expect(hrefOf("Listen: Full answers")).toBe("/jobs/acme/listen?doc=job:answers-full");
    expect(hrefOf("Drill: Full answers")).toBe("/jobs/acme/drill?doc=job:answers-full");
    expect(hrefOf("Quick-fire: Full answers")).toBe("/jobs/acme/quick-fire?doc=job:answers-full");
    expect(hrefOf("Listen: Pitch")).toBe("/jobs/acme/listen?doc=job:pitch");
    expect(screen.getByRole("group", { name: "Designer at GLOBEX" })).toBeTruthy();
  });

  it("shows 'Nothing is saved on this device yet.' when no job is saved", async () => {
    render(<OfflineNotice deps={{ caches: new FakeCaches() as unknown as CacheStorage }} />);
    expect(await screen.findByText("Nothing is saved on this device yet.")).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "Open a saved job" })).toBeNull();
  });

  it("shows the same empty line when Cache Storage is unavailable", async () => {
    render(<OfflineNotice deps={{ caches: undefined }} />);
    expect(await screen.findByText("Nothing is saved on this device yet.")).toBeTruthy();
  });

  it("the page needs no session and its copy has no exclamation mark", async () => {
    // The page module never imports the session helpers.
    const { readFileSync } = await import("node:fs");
    const source = readFileSync("app/offline/page.tsx", "utf8");
    expect(source).not.toContain("requireUser");
    expect(source).not.toContain("auth/session");
    expect(typeof OfflinePage).toBe("function");
    expect(JSON.stringify(OFFLINE_COPY.offline)).not.toContain("!");
  });
});
