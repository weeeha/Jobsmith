// The jobs saved on this device, read from Cache Storage: the list the
// offline page shows. Client-safe.
import type { PrepManifest } from "@/lib/prep/manifest";
import { PREP_CACHE_PREFIX, SAVED_META_PATH } from "./names";

export type SavedJob = {
  slug: string;
  roleTitle: string;
  companyName: string;
  banks: { key: string; title: string }[];
  pitches: { key: string; title: string }[];
};

/** Only a finished save counts: its meta entry is written last. */
export async function listSavedJobs(caches: CacheStorage): Promise<SavedJob[]> {
  const jobs: SavedJob[] = [];
  for (const name of await caches.keys()) {
    const match = new RegExp(`^${PREP_CACHE_PREFIX}[^-]+-(.+)$`).exec(name);
    if (!match) continue;
    const slug = match[1];
    try {
      const cache = await caches.open(name);
      if (!(await cache.match(SAVED_META_PATH))) continue;
      const hit = await cache.match(`/api/prep/${slug}`);
      if (!hit) continue;
      const manifest = (await hit.json()) as PrepManifest;
      jobs.push({
        slug,
        roleTitle: manifest.job.roleTitle,
        companyName: manifest.job.companyName,
        banks: manifest.banks.map((b) => ({ key: b.key, title: b.title })),
        pitches: manifest.pitches.map((p) => ({ key: p.key, title: p.title })),
      });
    } catch {
      // A damaged cache is left out of the list, never an error on this page.
    }
  }
  return jobs.sort((a, b) => a.companyName.localeCompare(b.companyName) || a.slug.localeCompare(b.slug));
}
