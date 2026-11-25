import { env } from "@/lib/env";
import type { Storage } from "./driver";
import { createLocalStorage } from "./local";
import { createMemoryStorage } from "./memory";
import { createS3Storage } from "./s3";
import { createVercelBlobStorage } from "./vercel-blob";

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
    case "s3":
      cached = createS3Storage(config);
      break;
    case "vercel_blob":
      cached = createVercelBlobStorage(config.token);
      break;
  }
  return cached;
}
