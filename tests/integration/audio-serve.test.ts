import { createHash } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import { makeTestDb, createTestUser } from "../helpers/db";
import { scoped, type Scoped } from "@/lib/db/scoped";
import { serveAsset } from "@/lib/audio/serve";
import { createMemoryStorage } from "@/lib/storage/memory";

const closers: (() => Promise<void>)[] = [];
afterEach(async () => {
  while (closers.length) await closers.pop()!();
});

const BYTES = Uint8Array.from({ length: 100 }, (_, i) => i);

async function setup() {
  const { db, close } = await makeTestDb();
  closers.push(close);
  const a = await createTestUser(db, "serve-a@example.com");
  const b = await createTestUser(db, "serve-b@example.com");
  const objects = new Map<string, Uint8Array>();
  const storage = createMemoryStorage(objects);
  return { sa: scoped(db, a.id), sb: scoped(db, b.id), storage, objects };
}

async function putAsset(s: Scoped, objects: Map<string, Uint8Array>, kind: "tts_segment" | "recording" = "tts_segment", key = "u/x/tts/one.mp3") {
  objects.set(key, BYTES.slice());
  return s.asset.insert({
    kind,
    storageKey: key,
    contentType: kind === "recording" ? "audio/ogg" : "audio/mpeg",
    bytes: BYTES.length,
    sha256: createHash("sha256").update(BYTES).digest("hex"),
    durationMs: 1000,
  });
}

async function body(response: Response): Promise<number[]> {
  return [...new Uint8Array(await response.arrayBuffer())];
}

describe("serveAsset", () => {
  it("serves the whole object with 200, Content-Type from the asset, Content-Length, Accept-Ranges bytes and the cache header", async () => {
    const { sa, storage, objects } = await setup();
    const asset = await putAsset(sa, objects);
    const res = await serveAsset(sa, storage, asset.id, null);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("audio/mpeg");
    expect(res.headers.get("content-length")).toBe("100");
    expect(res.headers.get("accept-ranges")).toBe("bytes");
    expect(res.headers.get("cache-control")).toBe("private, max-age=31536000, immutable");
    expect(await body(res)).toEqual([...BYTES]);
  });

  it("answers a Range with 206, the slice and Content-Range", async () => {
    const { sa, storage, objects } = await setup();
    const asset = await putAsset(sa, objects);
    const res = await serveAsset(sa, storage, asset.id, "bytes=0-9");
    expect(res.status).toBe(206);
    expect(res.headers.get("content-range")).toBe("bytes 0-9/100");
    expect(res.headers.get("content-length")).toBe("10");
    expect(await body(res)).toEqual([...BYTES.slice(0, 10)]);
  });

  it("answers an open-ended and a suffix range correctly", async () => {
    const { sa, storage, objects } = await setup();
    const asset = await putAsset(sa, objects);
    const open = await serveAsset(sa, storage, asset.id, "bytes=90-");
    expect(open.status).toBe(206);
    expect(open.headers.get("content-range")).toBe("bytes 90-99/100");
    expect(await body(open)).toEqual([...BYTES.slice(90)]);
    const suffix = await serveAsset(sa, storage, asset.id, "bytes=-20");
    expect(suffix.headers.get("content-range")).toBe("bytes 80-99/100");
    expect(await body(suffix)).toEqual([...BYTES.slice(80)]);
  });

  it("answers an unsatisfiable range with 416 and Content-Range bytes */100", async () => {
    const { sa, storage, objects } = await setup();
    const asset = await putAsset(sa, objects);
    const res = await serveAsset(sa, storage, asset.id, "bytes=100-");
    expect(res.status).toBe(416);
    expect(res.headers.get("content-range")).toBe("bytes */100");
  });

  it("another user's asset id is 404 and a non-uuid id is 404", async () => {
    const { sa, sb, storage, objects } = await setup();
    const asset = await putAsset(sa, objects);
    expect((await serveAsset(sb, storage, asset.id, null)).status).toBe(404);
    expect((await serveAsset(sa, storage, "not-a-uuid", null)).status).toBe(404);
    expect((await serveAsset(sa, storage, "../../etc/passwd", null)).status).toBe(404);
  });

  it("a missing object returns 404 and marks the segment failed with object_missing", async () => {
    const { sa, storage, objects } = await setup();
    const asset = await putAsset(sa, objects);
    await sa.ttsSegment.insert({
      hash: "0123456789abcdef",
      provider: "fake",
      model: "fake-tts",
      voice: "Vivian",
      style: "default",
      textChars: 10,
      assetId: asset.id,
      status: "done",
      errorCode: null,
      attempts: 1,
    });
    objects.clear();
    const res = await serveAsset(sa, storage, asset.id, null);
    expect(res.status).toBe(404);
    const row = (await sa.ttsSegment.listByHashes(["0123456789abcdef"]))[0];
    expect(row.status).toBe("failed");
    expect(row.errorCode).toBe("object_missing");
  });

  it("serves the caller's own recording assets the same way", async () => {
    const { sa, storage, objects } = await setup();
    const asset = await putAsset(sa, objects, "recording", "u/x/rec/one.ogg");
    const res = await serveAsset(sa, storage, asset.id, "bytes=5-9");
    expect(res.status).toBe(206);
    expect(res.headers.get("content-type")).toBe("audio/ogg");
  });

  it("sets a strong ETag from the asset's sha256", async () => {
    const { sa, storage, objects } = await setup();
    const asset = await putAsset(sa, objects);
    const res = await serveAsset(sa, storage, asset.id, null);
    expect(res.headers.get("etag")).toBe(`"${asset.sha256}"`);
  });
});
