// Save for offline: copies one job's manifest, player pages and clips into its
// Cache Storage cache. Client-safe: no database, no Node modules, and it only
// ever asks the app's own origin (every URL is a path, never an absolute URL).
import type { PrepManifest } from "@/lib/prep/manifest";
import { prepCacheName, SAVED_META_PATH } from "./names";

export type SavePlan = { pages: string[]; manifestUrl: string; assetUrls: string[]; totalBytes: number; clips: number };
export type SaveProgress = { done: number; total: number };
export type SavedMeta = { savedAt: Date; clips: number; bytes: number };

// The URL form is the worker's cache key (normalizePageKey in public/sw.js):
// the path and only ?doc, with the colon left as it is.
const pageUrl = (slug: string, leaf: "listen" | "drill" | "quick-fire", docKey: string) => `/jobs/${slug}/${leaf}?doc=job:${docKey}`;

export function planSave(manifest: PrepManifest): SavePlan {
  const pages: string[] = [];
  for (const bank of manifest.banks) {
    pages.push(pageUrl(manifest.slug, "listen", bank.key), pageUrl(manifest.slug, "drill", bank.key), pageUrl(manifest.slug, "quick-fire", bank.key));
  }
  for (const pitch of manifest.pitches) pages.push(pageUrl(manifest.slug, "listen", pitch.key));
  return {
    pages,
    manifestUrl: `/api/prep/${manifest.slug}`,
    assetUrls: manifest.assets.map((a) => `/api/assets/${a.id}`),
    totalBytes: manifest.totalBytes,
    clips: manifest.assets.length,
  };
}

/** Every /_next/static/... URL in a src or href attribute. */
export function extractStaticUrls(html: string): string[] {
  const found = new Set<string>();
  for (const match of html.matchAll(/\b(?:src|href)\s*=\s*(?:"([^"]*)"|'([^']*)')/gi)) {
    const value = (match[1] ?? match[2] ?? "").replaceAll("&amp;", "&");
    if (value.startsWith("/_next/static/")) found.add(value);
  }
  return [...found];
}

export async function saveForOffline(input: {
  slug: string;
  userHash: string;
  fetch: typeof fetch;
  caches: CacheStorage;
  onProgress(p: SaveProgress): void;
  signal?: AbortSignal;
}): Promise<{ ok: boolean; failed: string[]; savedAt: Date }> {
  const { slug, userHash, signal } = input;
  const cache = await input.caches.open(prepCacheName(userHash, slug));
  const failed: string[] = [];
  let done = 0;
  let total = 1;
  const tick = () => input.onProgress({ done, total });
  const get = (url: string) => input.fetch(url, { credentials: "include", signal });
  const finished = () => {
    done += 1;
    tick();
  };
  const checkAborted = () => signal?.throwIfAborted();
  tick();

  // Always refetched, even on a retry, so the plan being saved is the current one.
  let manifest: PrepManifest;
  try {
    const res = await get(`/api/prep/${slug}`);
    if (!res.ok || res.redirected) throw new Error(`manifest ${res.status}`);
    await cache.put(`/api/prep/${slug}`, res.clone());
    manifest = (await res.json()) as PrepManifest;
  } catch {
    checkAborted();
    return { ok: false, failed: [`/api/prep/${slug}`], savedAt: new Date() };
  }
  const plan = planSave(manifest);
  total = 1 + plan.pages.length + plan.assetUrls.length;
  finished();

  const staticUrls = new Set<string>();
  for (const url of plan.pages) {
    checkAborted();
    try {
      const hit = await cache.match(url);
      const res = hit ?? (await get(url));
      if (!res.ok || res.redirected) throw new Error(`page ${res.status}`);
      if (!hit) await cache.put(url, res.clone());
      for (const found of extractStaticUrls(await res.text())) staticUrls.add(found);
    } catch {
      checkAborted();
      failed.push(url);
    }
    finished();
  }

  // Static files go to the shell cache through the worker, which stores them
  // as they pass; a worker that is not yet in control just fetches them.
  total += staticUrls.size;
  tick();
  for (const url of staticUrls) {
    checkAborted();
    try {
      const res = await get(url);
      if (!res.ok) throw new Error(`static ${res.status}`);
      await res.arrayBuffer();
    } catch {
      checkAborted();
      failed.push(url);
    }
    finished();
  }

  for (const url of plan.assetUrls) {
    checkAborted();
    try {
      if (!(await cache.match(url))) {
        const res = await get(url);
        if (!res.ok || res.status === 206) throw new Error(`asset ${res.status}`);
        await cache.put(url, res.clone());
      }
    } catch {
      checkAborted();
      failed.push(url);
    }
    finished();
  }

  const savedAt = new Date();
  if (failed.length === 0) {
    const meta = { savedAt: savedAt.toISOString(), clips: plan.clips, bytes: plan.totalBytes };
    await cache.put(SAVED_META_PATH, new Response(JSON.stringify(meta), { headers: { "Content-Type": "application/json" } }));
  }
  return { ok: failed.length === 0, failed, savedAt };
}

export async function readSavedMeta(caches: CacheStorage, userHash: string, slug: string): Promise<SavedMeta | null> {
  const name = prepCacheName(userHash, slug);
  if (!(await caches.has(name))) return null;
  const hit = await (await caches.open(name)).match(SAVED_META_PATH);
  if (!hit) return null;
  const raw = (await hit.json()) as { savedAt: string; clips: number; bytes: number };
  return { savedAt: new Date(raw.savedAt), clips: raw.clips, bytes: raw.bytes };
}

export async function deleteSaved(caches: CacheStorage, userHash: string, slug: string): Promise<void> {
  await caches.delete(prepCacheName(userHash, slug));
}
