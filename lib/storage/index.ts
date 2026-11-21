import { env } from "@/lib/env";
import type { Storage } from "./driver";
import { createLocalStorage } from "./local";
import { createMemoryStorage } from "./memory";

export type { Storage } from "./driver";
export { StorageError } from "./driver";

let cached: Storage | undefined;

// The memory map lives on globalThis so separate Next bundles share it.
const MEMORY_KEY = Symbol.for("jobsmith.storage.memory");

export function getStorage(): Storage {
  if (cached) return cached;
  const config = env().STORAGE;
  switch (config.provider) {
    case "local":
      cached = createLocalStorage(config.dir);
      break;
    case "memory": {
      const g = globalThis as unknown as Record<symbol, Map<string, Uint8Array> | undefined>;
      const map = (g[MEMORY_KEY] ??= new Map<string, Uint8Array>());
      cached = createMemoryStorage(map);
      break;
    }
    default:
      // The s3 and vercel_blob cases arrive with Task 16.
      throw new Error(`storage provider ${config.provider} is not available yet`);
  }
  return cached;
}
