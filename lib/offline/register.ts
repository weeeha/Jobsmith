export type RegisterDeps = {
  serviceWorker?: ServiceWorkerContainer;
  // Defaults to process.env.NODE_ENV, which Next inlines in the browser.
  env?: string;
};

/**
 * Registers /sw.js?build=<id> with scope "/". Only in a production build: a
 * worker caching pages and static files would hide changes in `next dev`.
 * Returns null without support, in development, or when registration fails.
 */
export async function registerServiceWorker(buildId: string, deps: RegisterDeps = {}): Promise<ServiceWorkerRegistration | null> {
  const env = deps.env ?? process.env.NODE_ENV;
  if (env !== "production") return null;
  const container = deps.serviceWorker ?? (typeof navigator !== "undefined" ? navigator.serviceWorker : undefined);
  if (!container) return null;
  try {
    return await container.register(`/sw.js?build=${encodeURIComponent(buildId)}`, { scope: "/" });
  } catch (error) {
    console.error("service worker registration failed", error);
    return null;
  }
}
