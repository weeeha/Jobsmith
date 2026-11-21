import { StorageError, type Storage } from "./driver";

type Options = Record<string, unknown>;

// The three calls the driver makes, so tests inject a fake. `get` returns null
// for a missing blob, as the SDK's `get` does.
export type BlobLike = {
  put(pathname: string, body: Uint8Array, options: Options): Promise<unknown>;
  get(
    pathname: string,
    options: Options,
  ): Promise<{ statusCode: number; stream: ReadableStream<Uint8Array> | null } | null>;
  del(pathname: string, options: Options): Promise<void>;
};

async function loadClient(): Promise<BlobLike> {
  const sdk = await import("@vercel/blob");
  return {
    put: (pathname, body, options) =>
      sdk.put(pathname, Buffer.from(body), options as unknown as Parameters<typeof sdk.put>[2]),
    get: (pathname, options) =>
      sdk.get(pathname, options as unknown as Parameters<typeof sdk.get>[1]),
    del: (pathname, options) => sdk.del(pathname, options),
  };
}

function errorName(error: unknown): string {
  return error instanceof Error && error.name ? error.name : "error";
}

async function readAll(stream: ReadableStream<Uint8Array>): Promise<Uint8Array> {
  const chunks: Uint8Array[] = [];
  const reader = stream.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
  }
  const out = new Uint8Array(chunks.reduce((n, c) => n + c.length, 0));
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.length;
  }
  return out;
}

export function createVercelBlobStorage(token: string, injected?: BlobLike): Storage {
  let clientPromise: Promise<BlobLike> | undefined;
  const client = () => (clientPromise ??= injected ? Promise.resolve(injected) : loadClient());

  return {
    async put(key, bytes, contentType) {
      try {
        // Private, and the key is the pathname as given: no random suffix.
        await (await client()).put(key, bytes, {
          access: "private",
          token,
          contentType,
          addRandomSuffix: false,
          allowOverwrite: true,
        });
      } catch (error) {
        throw new StorageError(`vercel blob put failed: ${errorName(error)}`);
      }
    },
    async get(key) {
      try {
        const result = await (await client()).get(key, { access: "private", token });
        if (!result || !result.stream) return null;
        return await readAll(result.stream);
      } catch (error) {
        if (errorName(error) === "BlobNotFoundError") return null;
        throw new StorageError(`vercel blob get failed: ${errorName(error)}`);
      }
    },
    async delete(key) {
      try {
        await (await client()).del(key, { token });
      } catch (error) {
        if (errorName(error) === "BlobNotFoundError") return;
        throw new StorageError(`vercel blob delete failed: ${errorName(error)}`);
      }
    },
  };
}
