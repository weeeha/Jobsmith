import { describe, it, expect } from "vitest";
import { createRequire } from "node:module";
import path from "node:path";
import { formatSaveSize } from "@/lib/offline/format";
import { prepCacheName, shellCacheName } from "@/lib/offline/names";
import { planSave } from "@/lib/offline/save";
import type { PrepManifest } from "@/lib/prep/manifest";

const sw = createRequire(import.meta.url)(path.resolve(import.meta.dirname, "../../public/sw.js")) as {
  prepCacheName(u: string, s: string): string;
  shellCacheName(b: string): string;
  normalizePageKey(url: string): string;
};

describe("formatSaveSize", () => {
  it("reads '38 MB, 96 clips' and '1 MB, 1 clip' at the smallest", () => {
    expect(formatSaveSize(38 * 1024 * 1024, 96)).toBe("38 MB, 96 clips");
    expect(formatSaveSize(1200, 1)).toBe("1 MB, 1 clip");
    expect(formatSaveSize(0, 0)).toBe("1 MB, 0 clips");
  });
});

describe("agreement with public/sw.js", () => {
  it("the cache name rule here equals the one in public/sw.js", () => {
    expect(prepCacheName("0123456789abcdef", "acme-designer")).toBe(sw.prepCacheName("0123456789abcdef", "acme-designer"));
    expect(shellCacheName("b1")).toBe(sw.shellCacheName("b1"));
  });

  it("every page URL Save for offline stores is already the worker's normalized key", () => {
    const plan = { title: "t", subtitle: "s", questions: [], steps: [] };
    const m = {
      slug: "acme",
      banks: [{ key: "bank-1", plan }],
      pitches: [{ key: "pitch", plan }],
      assets: [],
      totalBytes: 0,
    } as unknown as PrepManifest;
    for (const url of planSave(m).pages) expect(sw.normalizePageKey(url)).toBe(url);
  });
});
