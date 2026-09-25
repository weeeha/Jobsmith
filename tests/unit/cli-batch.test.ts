import { describe, expect, it } from "vitest";
import { batchArtifacts } from "@/cli/src/batch";
import type { WireArtifact } from "@/lib/bridge/wire";

function artifact(key: string, bodyLength: number): WireArtifact {
  return { key, kind: "cv", body_md: "y".repeat(bodyLength) };
}

describe("batchArtifacts", () => {
  it("splits by count when every item is small", () => {
    const items = [1, 2, 3, 4, 5].map((n) => artifact(`k${n}`, 1));
    const batches = batchArtifacts(items, { maxCount: 2, maxBytes: 1_000_000 });
    expect(batches.map((b) => b.length)).toEqual([2, 2, 1]);
    expect(batches.flat()).toEqual(items);
  });

  it("splits by serialized byte size when the count limit would allow more per batch", () => {
    const items = [1, 2, 3, 4].map((n) => artifact(`key-${n}`, 20));
    const oneItemBytes = Buffer.byteLength(JSON.stringify({ artifacts: [items[0]] }), "utf8");
    const batches = batchArtifacts(items, { maxCount: 50, maxBytes: oneItemBytes + 10 });
    expect(batches.every((b) => b.length === 1)).toBe(true);
    expect(batches).toHaveLength(4);
  });

  it("gives a single item over the byte cap its own batch, rather than dropping it or looping forever", () => {
    const oversized = artifact("big", 200);
    const small = artifact("small", 1);
    expect(batchArtifacts([oversized, small], { maxCount: 50, maxBytes: 50 })).toEqual([[oversized], [small]]);
  });

  it("returns an empty array for no items", () => {
    expect(batchArtifacts([], { maxCount: 50, maxBytes: 1000 })).toEqual([]);
  });

  it("defaults to MAX_ARTIFACTS_PER_PUSH and MAX_PUSH_BYTES when no limits are given", () => {
    const items = Array.from({ length: 60 }, (_, i) => artifact(`k${i}`, 10));
    const batches = batchArtifacts(items);
    expect(batches[0]!.length).toBeLessThanOrEqual(50);
    expect(batches.flat()).toHaveLength(60);
  });
});
