import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const FILES = ["wav.ts", "encode.ts", "duration.ts", "normalize.ts"];

describe("lib/audio bundle safety", () => {
  it("lib/audio/wav.ts, encode.ts, duration.ts and normalize.ts import nothing from the database, Next or node: modules", () => {
    for (const file of FILES) {
      const source = readFileSync(path.join(process.cwd(), "lib/audio", file), "utf8");
      const specifiers = [...source.matchAll(/(?:from|import)\s*\(?\s*["']([^"']+)["']/g)].map((m) => m[1]);
      for (const spec of specifiers) {
        expect(spec, `${file} imports ${spec}`).not.toMatch(/^node:/);
        expect(spec, `${file} imports ${spec}`).not.toMatch(/^next(\/|$)/);
        expect(spec, `${file} imports ${spec}`).not.toMatch(/^@\/lib\/db/);
        expect(spec, `${file} imports ${spec}`).not.toMatch(/^(fs|path|crypto|buffer|stream|os)(\/|$)/);
      }
      expect(source, `${file} uses Buffer`).not.toMatch(/\bBuffer\b/);
    }
  });

  it("only imports other bundle-safe modules, the Result type, TTS types and the MP3 encoder package", () => {
    const allowed = /^(\.\/[a-z-]+|@\/lib\/result|@\/lib\/tts\/driver|@breezystack\/lamejs)$/;
    for (const file of FILES) {
      const source = readFileSync(path.join(process.cwd(), "lib/audio", file), "utf8");
      for (const m of source.matchAll(/(?:from|import)\s*\(?\s*["']([^"']+)["']/g)) {
        expect(m[1], `${file} imports ${m[1]}`).toMatch(allowed);
      }
    }
  });
});
