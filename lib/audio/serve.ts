import type { Scoped } from "@/lib/db/scoped";
import type { Storage } from "@/lib/storage/driver";
import { markObjectMissing } from "./segments";
import { parseRange } from "./range";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CACHE_CONTROL = "private, max-age=31536000, immutable";

function notFound(): Response {
  return new Response("Not found", { status: 404, headers: { "cache-control": "no-store" } });
}

// Serves one of the caller's own assets, whole or as a single byte range.
// Clips are under 2 MB, so the slice is cut in memory.
export async function serveAsset(s: Scoped, storage: Storage, id: string, rangeHeader: string | null): Promise<Response> {
  if (!UUID.test(id)) return notFound();
  const asset = await s.asset.getById(id);
  if (!asset) return notFound();

  let bytes: Uint8Array | null;
  try {
    bytes = await storage.get(asset.storageKey);
  } catch {
    return new Response("Storage unavailable", { status: 502, headers: { "cache-control": "no-store" } });
  }
  if (!bytes) {
    await markObjectMissing(s, asset.id);
    return notFound();
  }

  const size = bytes.length;
  const headers: Record<string, string> = {
    "content-type": asset.contentType,
    "accept-ranges": "bytes",
    "cache-control": CACHE_CONTROL,
    etag: `"${asset.sha256}"`,
  };
  const range = parseRange(rangeHeader, size);
  if (range.kind === "unsatisfiable") {
    return new Response(null, { status: 416, headers: { ...headers, "content-range": `bytes */${size}` } });
  }
  if (range.kind === "range") {
    const slice = bytes.slice(range.start, range.end + 1);
    return new Response(slice as BodyInit, {
      status: 206,
      headers: { ...headers, "content-length": String(slice.length), "content-range": `bytes ${range.start}-${range.end}/${size}` },
    });
  }
  return new Response(bytes as BodyInit, { status: 200, headers: { ...headers, "content-length": String(size) } });
}
