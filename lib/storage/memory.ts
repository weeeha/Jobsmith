import type { Storage } from "./driver";

export function createMemoryStorage(objects: Map<string, Uint8Array> = new Map()): Storage {
  return {
    async put(key, bytes) {
      objects.set(key, bytes.slice());
    },
    async get(key) {
      return objects.get(key)?.slice() ?? null;
    },
    async delete(key) {
      objects.delete(key);
    },
  };
}
