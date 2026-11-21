import { randomBytes } from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { StorageError, type Storage } from "./driver";
import { STORAGE_KEY_PATTERN } from "./keys";

function checked(key: string): string {
  if (!STORAGE_KEY_PATTERN.test(key)) throw new StorageError("invalid storage key");
  return key;
}

function isNotFound(error: unknown): boolean {
  return (error as NodeJS.ErrnoException | null)?.code === "ENOENT";
}

export function createLocalStorage(dir: string): Storage {
  const root = path.resolve(dir);
  const fileFor = (key: string) => path.join(root, checked(key));

  return {
    async put(key, bytes) {
      const file = fileFor(key);
      const temp = `${file}.tmp-${randomBytes(6).toString("hex")}`;
      try {
        await mkdir(path.dirname(file), { recursive: true });
        await writeFile(temp, bytes);
        await rename(temp, file);
      } catch (error) {
        await rm(temp, { force: true }).catch(() => undefined);
        throw new StorageError(`local put failed: ${(error as NodeJS.ErrnoException).code ?? "error"}`);
      }
    },
    async get(key) {
      const file = fileFor(key);
      try {
        return new Uint8Array(await readFile(file));
      } catch (error) {
        if (isNotFound(error)) return null;
        throw new StorageError(`local get failed: ${(error as NodeJS.ErrnoException).code ?? "error"}`);
      }
    },
    async delete(key) {
      const file = fileFor(key);
      try {
        await rm(file, { force: true });
      } catch (error) {
        throw new StorageError(`local delete failed: ${(error as NodeJS.ErrnoException).code ?? "error"}`);
      }
    },
  };
}
