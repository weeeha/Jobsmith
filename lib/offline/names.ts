// The cache naming rules shared with public/sw.js, which cannot import them.
// tests/unit/offline-format.test.ts loads the worker and checks both agree.
export const SHELL_CACHE_PREFIX = "jobsmith-shell-";
export const PREP_CACHE_PREFIX = "jobsmith-prep-";
/** Synthetic cache entry written last, so its presence means the save finished. */
export const SAVED_META_PATH = "/__saved-meta";

export function shellCacheName(buildId: string): string {
  return `${SHELL_CACHE_PREFIX}${buildId}`;
}

export function prepCacheName(userHash: string, slug: string): string {
  return `${PREP_CACHE_PREFIX}${userHash}-${slug}`;
}
