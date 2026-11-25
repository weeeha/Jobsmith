import { afterEach, describe, expect, it, vi } from "vitest";
import { clearOfflineData } from "@/lib/offline/clear";

class FakeCaches {
  constructor(public names: string[]) {}
  async keys() {
    return [...this.names];
  }
  async delete(name: string) {
    const had = this.names.includes(name);
    this.names = this.names.filter((n) => n !== name);
    return had;
  }
}

const ALL = ["jobsmith-prep-aaaa-one", "jobsmith-prep-aaaa-two", "jobsmith-prep-bbbb-one", "jobsmith-shell-b1"];

/** A container whose controlling worker answers on the port it is given. */
function answeringWorker(caches: FakeCaches) {
  const posted: unknown[] = [];
  const container = {
    controller: {
      postMessage(message: { type: string; userHash: string }, ports: MessagePort[]) {
        posted.push(message);
        const deleted = caches.names.filter((n) => n.startsWith(`jobsmith-prep-${message.userHash}-`));
        caches.names = caches.names.filter((n) => !deleted.includes(n));
        ports[0].postMessage({ ok: true, deleted });
      },
    },
  } as unknown as ServiceWorkerContainer;
  return { container, posted };
}

afterEach(() => vi.useRealTimers());

describe("clearOfflineData", () => {
  it("posts clear-user with the user hash to the controlling worker and waits for its answer", async () => {
    const caches = new FakeCaches(ALL);
    const { container, posted } = answeringWorker(caches);
    const result = await clearOfflineData("aaaa", { serviceWorker: container, caches: caches as unknown as CacheStorage, clearQueue: async () => {} });
    expect(posted).toEqual([{ type: "clear-user", userHash: "aaaa" }]);
    expect(result.deleted.sort()).toEqual(["jobsmith-prep-aaaa-one", "jobsmith-prep-aaaa-two"]);
  });

  it("deletes the user's prep caches itself when no worker answers within 2 seconds", async () => {
    vi.useFakeTimers();
    const caches = new FakeCaches(ALL);
    const silent = { controller: { postMessage() {} } } as unknown as ServiceWorkerContainer;
    const pending = clearOfflineData("aaaa", { serviceWorker: silent, caches: caches as unknown as CacheStorage, clearQueue: async () => {} });
    let settled = false;
    void pending.then(() => (settled = true));
    await vi.advanceTimersByTimeAsync(1900);
    expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(200);
    const result = await pending;
    expect(result.deleted.sort()).toEqual(["jobsmith-prep-aaaa-one", "jobsmith-prep-aaaa-two"]);
    expect(caches.names).toEqual(["jobsmith-prep-bbbb-one", "jobsmith-shell-b1"]);
  });

  it("deletes the caches itself when there is no controlling worker", async () => {
    const caches = new FakeCaches(ALL);
    const none = { controller: null } as unknown as ServiceWorkerContainer;
    const result = await clearOfflineData("aaaa", { serviceWorker: none, caches: caches as unknown as CacheStorage, clearQueue: async () => {} });
    expect(result.deleted.length).toBe(2);
  });

  it("never deletes another user's caches", async () => {
    const caches = new FakeCaches(["jobsmith-prep-aaaab-one", "jobsmith-prep-bbbb-one", "jobsmith-shell-b1"]);
    const result = await clearOfflineData("aaaa", { serviceWorker: undefined, caches: caches as unknown as CacheStorage, clearQueue: async () => {} });
    expect(result.deleted).toEqual([]);
    expect(caches.names.length).toBe(3);
  });

  it("clears that user's queued marks", async () => {
    const clearQueue = vi.fn(async () => {});
    await clearOfflineData("aaaa", { caches: new FakeCaches([]) as unknown as CacheStorage, clearQueue });
    expect(clearQueue).toHaveBeenCalledWith("aaaa");
  });

  it("resolves even when serviceWorker and caches are missing", async () => {
    await expect(clearOfflineData("aaaa", { serviceWorker: undefined, caches: undefined, clearQueue: async () => {} })).resolves.toEqual({ deleted: [] });
  });

  it("resolves when clearing the queue throws, after the caches are gone", async () => {
    const caches = new FakeCaches(ALL);
    const result = await clearOfflineData("aaaa", {
      caches: caches as unknown as CacheStorage,
      clearQueue: async () => {
        throw new Error("idb blocked");
      },
    });
    expect(result.deleted.length).toBe(2);
  });
});
