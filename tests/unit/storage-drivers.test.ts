import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { StorageError } from "@/lib/storage/driver";
import { createLocalStorage } from "@/lib/storage/local";
import { createMemoryStorage } from "@/lib/storage/memory";
import { runStorageContract } from "../helpers/storage-contract";

const dirs: string[] = [];
async function tmp(): Promise<string> {
  const dir = await mkdtemp(path.join(tmpdir(), "jobsmith-storage-"));
  dirs.push(dir);
  return dir;
}
afterAll(async () => {
  await Promise.all(dirs.map((dir) => rm(dir, { recursive: true, force: true })));
});

runStorageContract("memory", () => createMemoryStorage());
runStorageContract("local", async () => createLocalStorage(await tmp()));

describe("createMemoryStorage", () => {
  it("keeps separate state per call", async () => {
    const a = createMemoryStorage();
    const b = createMemoryStorage();
    const key = "u/0123456789abcdef/tts/0123456789abcdef0123456789abcdef.mp3";
    await a.put(key, new Uint8Array([1]), "audio/mpeg");
    expect(await b.get(key)).toBeNull();
  });
});

describe("createLocalStorage", () => {
  it("rejects a key that does not match STORAGE_KEY_PATTERN with StorageError, before touching the disk", async () => {
    const dir = await tmp();
    const storage = createLocalStorage(dir);
    for (const key of ["../x", "/etc/passwd", "u/zz/tts/x.mp3"]) {
      await expect(storage.put(key, new Uint8Array([1]), "audio/mpeg")).rejects.toBeInstanceOf(StorageError);
      await expect(storage.get(key)).rejects.toBeInstanceOf(StorageError);
      await expect(storage.delete(key)).rejects.toBeInstanceOf(StorageError);
    }
    expect(await readdir(dir)).toEqual([]);
  });

  it("local writes through a temporary file so a reader never sees half an object", async () => {
    const dir = await tmp();
    const storage = createLocalStorage(dir);
    const key = "u/0123456789abcdef/tts/0123456789abcdef0123456789abcdef.mp3";
    const big = new Uint8Array(512 * 1024).fill(7);
    const write = storage.put(key, big, "audio/mpeg");
    // While the write is in flight a reader sees nothing or the whole object.
    const seen = await storage.get(key);
    expect(seen === null || seen.length === big.length).toBe(true);
    await write;
    expect((await storage.get(key))?.length).toBe(big.length);
    const leftovers = (await readdir(path.join(dir, "u/0123456789abcdef/tts"))).filter((f) =>
      f.includes(".tmp-"),
    );
    expect(leftovers).toEqual([]);
  });
});
