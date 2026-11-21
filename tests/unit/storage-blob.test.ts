import { describe, expect, it } from "vitest";
import { StorageError } from "@/lib/storage/driver";
import { createVercelBlobStorage, type BlobLike } from "@/lib/storage/vercel-blob";

const KEY = "u/0123456789abcdef/tts/0123456789abcdef0123456789abcdef.mp3";

type Call = { op: "put" | "get" | "del"; pathname: string; options: Record<string, unknown>; body?: unknown };

function fakeBlob(opts: { get?: () => unknown; fail?: Error } = {}): { client: BlobLike; calls: Call[] } {
  const calls: Call[] = [];
  const client: BlobLike = {
    async put(pathname, body, options) {
      if (opts.fail) throw opts.fail;
      calls.push({ op: "put", pathname, options, body });
      return {};
    },
    async get(pathname, options) {
      calls.push({ op: "get", pathname, options });
      if (opts.fail) throw opts.fail;
      return (opts.get ? opts.get() : null) as Awaited<ReturnType<BlobLike["get"]>>;
    },
    async del(pathname, options) {
      calls.push({ op: "del", pathname, options });
    },
  };
  return { client, calls };
}

function streamOf(bytes: Uint8Array): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(controller) {
      controller.enqueue(bytes.slice(0, 2));
      controller.enqueue(bytes.slice(2));
      controller.close();
    },
  });
}

describe("createVercelBlobStorage", () => {
  it("put always requests private access and never public", async () => {
    const { client, calls } = fakeBlob();
    const storage = createVercelBlobStorage("tok", client);
    await storage.put(KEY, new Uint8Array([1, 2]), "audio/mpeg");
    await storage.get(KEY);
    await storage.delete(KEY);
    expect(calls.filter((c) => c.op !== "del").map((c) => c.options.access)).toEqual(["private", "private"]);
    for (const call of calls) expect(call.options.access).not.toBe("public");
    expect(calls[0].options.contentType).toBe("audio/mpeg");
    expect(calls[0].options.token).toBe("tok");
  });

  it("put overwrites an existing pathname and adds no random suffix", async () => {
    const { client, calls } = fakeBlob();
    await createVercelBlobStorage("tok", client).put(KEY, new Uint8Array([1]), "audio/mpeg");
    expect(calls[0].pathname).toBe(KEY);
    expect(calls[0].options.addRandomSuffix).toBe(false);
    expect(calls[0].options.allowOverwrite).toBe(true);
  });

  it("get returns the bytes of the stream", async () => {
    const bytes = new Uint8Array([9, 8, 7, 6]);
    const { client } = fakeBlob({ get: () => ({ statusCode: 200, stream: streamOf(bytes) }) });
    const got = await createVercelBlobStorage("tok", client).get(KEY);
    expect(Array.from(got ?? [])).toEqual([9, 8, 7, 6]);
  });

  it("get returns null when the blob is missing", async () => {
    const { client } = fakeBlob({ get: () => null });
    expect(await createVercelBlobStorage("tok", client).get(KEY)).toBeNull();
  });

  it("delete passes the pathname", async () => {
    const { client, calls } = fakeBlob();
    await createVercelBlobStorage("tok", client).delete(KEY);
    expect(calls[0]).toMatchObject({ op: "del", pathname: KEY });
    expect(calls[0].options.token).toBe("tok");
  });

  it("surfaces failures as StorageError with the error name only", async () => {
    const error = new Error(`boom ${KEY}`);
    error.name = "BlobServiceNotAvailable";
    const { client } = fakeBlob({ fail: error });
    const storage = createVercelBlobStorage("tok", client);
    const put = await storage.put(KEY, new Uint8Array([1]), "audio/mpeg").catch((e: unknown) => e);
    expect(put).toBeInstanceOf(StorageError);
    expect((put as Error).message).toContain("BlobServiceNotAvailable");
    expect((put as Error).message).not.toContain(KEY);
    const got = await storage.get(KEY).catch((e: unknown) => e);
    expect(got).toBeInstanceOf(StorageError);
  });
});
