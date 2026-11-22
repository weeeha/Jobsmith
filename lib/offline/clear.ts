// Sign-out clearing: everything this device holds for one user. Client-safe.
import { deleteForUser, idbAvailable } from "./idb";
import { PREP_CACHE_PREFIX } from "./names";

export type ClearDeps = {
  serviceWorker?: ServiceWorkerContainer;
  caches?: CacheStorage;
  clearQueue?(userHash: string): Promise<void>;
};

/** How long sign-out waits for the worker's answer before it deletes the caches itself. */
export const WORKER_ANSWER_MS = 2000;

function askWorker(container: ServiceWorkerContainer | undefined, userHash: string): Promise<string[] | null> {
  const controller = container?.controller;
  if (!controller || typeof MessageChannel === "undefined") return Promise.resolve(null);
  return new Promise((resolve) => {
    const channel = new MessageChannel();
    const finish = (value: string[] | null) => {
      clearTimeout(timer);
      channel.port1.close();
      resolve(value);
    };
    const timer = setTimeout(() => finish(null), WORKER_ANSWER_MS);
    channel.port1.onmessage = (event: MessageEvent) => {
      const deleted = (event.data as { deleted?: unknown } | null)?.deleted;
      finish(Array.isArray(deleted) ? (deleted as string[]) : []);
    };
    try {
      controller.postMessage({ type: "clear-user", userHash }, [channel.port2]);
    } catch {
      finish(null);
    }
  });
}

/**
 * Removes one user's saved jobs and queued marks from this device. The
 * controlling worker is asked first; whether or not it answers, the caches
 * are then deleted here too, so sign-out clears with no worker in control.
 * Never throws: a failure here must not keep the user signed in.
 */
export async function clearOfflineData(userHash: string, deps: ClearDeps = {}): Promise<{ deleted: string[] }> {
  const container = "serviceWorker" in deps ? deps.serviceWorker : typeof navigator !== "undefined" ? navigator.serviceWorker : undefined;
  const cachesApi = "caches" in deps ? deps.caches : typeof caches !== "undefined" ? caches : undefined;
  const clearQueue = deps.clearQueue ?? (async (hash: string) => (idbAvailable() ? deleteForUser(hash) : undefined));

  const deleted = new Set<string>();
  try {
    for (const name of (await askWorker(container, userHash)) ?? []) deleted.add(name);
  } catch {
    // The worker is optional.
  }
  if (cachesApi) {
    try {
      const mine = `${PREP_CACHE_PREFIX}${userHash}-`;
      for (const name of await cachesApi.keys()) {
        if (!name.startsWith(mine)) continue;
        await cachesApi.delete(name);
        deleted.add(name);
      }
    } catch (error) {
      console.error("clearing saved jobs failed", error);
    }
  }
  try {
    await clearQueue(userHash);
  } catch (error) {
    console.error("clearing queued marks failed", error);
  }
  return { deleted: [...deleted] };
}
