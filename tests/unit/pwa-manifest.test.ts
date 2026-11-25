import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import manifest from "@/app/manifest";
import { THEME_COLOR_DARK, THEME_COLOR_LIGHT } from "@/lib/pwa/theme";

const root = path.resolve(import.meta.dirname, "../..");

function pngSize(file: string): { width: number; height: number } {
  const buf = readFileSync(path.join(root, file));
  // PNG signature, then the IHDR chunk: width and height are big-endian at 16 and 20.
  expect(buf.subarray(1, 4).toString("ascii")).toBe("PNG");
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

function cssToken(name: string): string {
  const css = readFileSync(path.join(root, "app/globals.css"), "utf8");
  const match = css.match(new RegExp(`${name}:\\s*(#[0-9a-fA-F]{6})`));
  if (!match) throw new Error(`${name} not found in globals.css`);
  return match[1].toLowerCase();
}

describe("web app manifest", () => {
  it("has name Jobsmith, display standalone, start_url / and the theme colour", () => {
    const m = manifest();
    expect(m.name).toBe("Jobsmith");
    expect(m.short_name).toBe("Jobsmith");
    expect(m.display).toBe("standalone");
    expect(m.start_url).toBe("/");
    expect(m.theme_color).toBe(THEME_COLOR_LIGHT);
    expect(m.background_color).toBe(THEME_COLOR_LIGHT);
  });

  it("lists a 192 and a 512 pixel maskable PNG and both files exist with those dimensions", () => {
    const icons = manifest().icons ?? [];
    expect(icons.map((i) => i.sizes).sort()).toEqual(["192x192", "512x512"]);
    for (const icon of icons) {
      expect(icon.type).toBe("image/png");
      expect(icon.purpose).toBe("maskable");
      const side = Number(String(icon.sizes).split("x")[0]);
      expect(pngSize(`public${icon.src}`)).toEqual({ width: side, height: side });
    }
  });

  it("app/apple-icon.png is 180 by 180", () => {
    expect(pngSize("app/apple-icon.png")).toEqual({ width: 180, height: 180 });
  });

  it("THEME_COLOR_LIGHT and THEME_COLOR_DARK equal --base-50 and --base-950 as written in app/globals.css", () => {
    expect(THEME_COLOR_LIGHT).toBe(cssToken("--base-50"));
    expect(THEME_COLOR_DARK).toBe(cssToken("--base-950"));
  });

  it("layout exports a viewport with a light and a dark theme colour", async () => {
    // layout.tsx imports next/font, which only resolves inside Next, so read the source.
    const src = readFileSync(path.join(root, "app/layout.tsx"), "utf8");
    expect(src).toMatch(/export const viewport/);
    expect(src).toMatch(/prefers-color-scheme: light[\s\S]*THEME_COLOR_LIGHT/);
    expect(src).toMatch(/prefers-color-scheme: dark[\s\S]*THEME_COLOR_DARK/);
    expect(src).toMatch(/width: "device-width"/);
    expect(src).toMatch(/initialScale: 1/);
    expect(src).toMatch(/appleWebApp: \{[^}]*capable: true[^}]*title: "Jobsmith"/);
  });

  it("no manifest string contains an exclamation mark", () => {
    expect(JSON.stringify(manifest())).not.toContain("!");
  });
});
