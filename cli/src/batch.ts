import { MAX_ARTIFACTS_PER_PUSH, MAX_PUSH_BYTES, type WireArtifact } from "@/lib/bridge/wire";

export function batchArtifacts(
  items: WireArtifact[],
  limits?: { maxCount: number; maxBytes: number },
): WireArtifact[][] {
  const maxCount = limits?.maxCount ?? MAX_ARTIFACTS_PER_PUSH;
  const maxBytes = limits?.maxBytes ?? MAX_PUSH_BYTES;
  const batches: WireArtifact[][] = [];
  let current: WireArtifact[] = [];
  for (const item of items) {
    const candidate = [...current, item];
    // Measuring the exact { artifacts: [...] } envelope the push endpoint's
    // body has, not just the sum of the items' own sizes, so the limit
    // matches what actually crosses the wire.
    const candidateBytes = Buffer.byteLength(JSON.stringify({ artifacts: candidate }), "utf8");
    if (current.length > 0 && (candidate.length > maxCount || candidateBytes > maxBytes)) {
      batches.push(current);
      current = [item];
    } else {
      current = candidate;
    }
  }
  if (current.length > 0) {
    batches.push(current);
  }
  return batches;
}
