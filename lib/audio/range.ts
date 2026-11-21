export type RangeResult =
  | { kind: "none" }
  | { kind: "range"; start: number; end: number }
  | { kind: "unsatisfiable" };

const SINGLE_RANGE = /^bytes=(\d*)-(\d*)$/;

// One byte range, as a browser's audio element asks for it. A header that is
// missing, malformed or asks for several ranges is ignored (the whole object
// is served), as the HTTP spec allows.
export function parseRange(header: string | null, size: number): RangeResult {
  if (!header) return { kind: "none" };
  const match = SINGLE_RANGE.exec(header.trim());
  if (!match) return { kind: "none" };
  const [, from, to] = match;
  if (from === "" && to === "") return { kind: "none" };
  if (from === "") {
    const suffix = Number(to);
    if (suffix === 0) return { kind: "unsatisfiable" };
    return { kind: "range", start: Math.max(0, size - suffix), end: size - 1 };
  }
  const start = Number(from);
  if (to !== "" && Number(to) < start) return { kind: "none" };
  if (start >= size) return { kind: "unsatisfiable" };
  const end = to === "" ? size - 1 : Math.min(Number(to), size - 1);
  return { kind: "range", start, end };
}
