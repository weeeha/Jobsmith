import { describe, expect, it } from "vitest";
import { parseRange } from "@/lib/audio/range";

describe("parseRange (size 100)", () => {
  it("bytes=0-9 is start 0 end 9; bytes=10- runs to the end; bytes=-20 is the last 20 bytes", () => {
    expect(parseRange("bytes=0-9", 100)).toEqual({ kind: "range", start: 0, end: 9 });
    expect(parseRange("bytes=10-", 100)).toEqual({ kind: "range", start: 10, end: 99 });
    expect(parseRange("bytes=-20", 100)).toEqual({ kind: "range", start: 80, end: 99 });
  });

  it("an end past the size is clamped; a start at or past the size is unsatisfiable", () => {
    expect(parseRange("bytes=90-500", 100)).toEqual({ kind: "range", start: 90, end: 99 });
    expect(parseRange("bytes=100-", 100)).toEqual({ kind: "unsatisfiable" });
    expect(parseRange("bytes=150-160", 100)).toEqual({ kind: "unsatisfiable" });
    expect(parseRange("bytes=-0", 100)).toEqual({ kind: "unsatisfiable" });
  });

  it("a suffix longer than the object is the whole object", () => {
    expect(parseRange("bytes=-500", 100)).toEqual({ kind: "range", start: 0, end: 99 });
  });

  it("a missing, malformed or multi-range header is none", () => {
    expect(parseRange(null, 100)).toEqual({ kind: "none" });
    expect(parseRange("", 100)).toEqual({ kind: "none" });
    expect(parseRange("items=0-9", 100)).toEqual({ kind: "none" });
    expect(parseRange("bytes=a-b", 100)).toEqual({ kind: "none" });
    expect(parseRange("bytes=-", 100)).toEqual({ kind: "none" });
    expect(parseRange("bytes=0-9,20-29", 100)).toEqual({ kind: "none" });
    expect(parseRange("bytes=20-10", 100)).toEqual({ kind: "none" });
  });
});
