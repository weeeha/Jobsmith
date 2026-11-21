import { describe, expect, it } from "vitest";
import type { Storage } from "@/lib/storage/driver";

const KEY_A = "u/0123456789abcdef/tts/0123456789abcdef0123456789abcdef.mp3";
const KEY_B = "u/0123456789abcdef/tts/fedcba9876543210fedcba9876543210.mp3";

// One suite every Storage driver must pass. `make` builds a fresh driver.
export function runStorageContract(name: string, make: () => Storage | Promise<Storage>): void {
  describe(`Storage contract: ${name}`, () => {
    it("put then get returns the same bytes", async () => {
      const storage = await make();
      const bytes = new Uint8Array([1, 2, 3, 250, 0, 7]);
      await storage.put(KEY_A, bytes, "audio/mpeg");
      expect(Array.from((await storage.get(KEY_A)) ?? [])).toEqual(Array.from(bytes));
    });

    it("get of a missing key returns null", async () => {
      const storage = await make();
      expect(await storage.get(KEY_B)).toBeNull();
    });

    it("put overwrites an existing key", async () => {
      const storage = await make();
      await storage.put(KEY_A, new Uint8Array([1]), "audio/mpeg");
      await storage.put(KEY_A, new Uint8Array([9, 9]), "audio/mpeg");
      expect(Array.from((await storage.get(KEY_A)) ?? [])).toEqual([9, 9]);
    });

    it("delete removes the object and deleting a missing key does not throw", async () => {
      const storage = await make();
      await storage.put(KEY_A, new Uint8Array([1]), "audio/mpeg");
      await storage.delete(KEY_A);
      expect(await storage.get(KEY_A)).toBeNull();
      await expect(storage.delete(KEY_A)).resolves.toBeUndefined();
      await expect(storage.delete(KEY_B)).resolves.toBeUndefined();
    });
  });
}
